import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  ReservationStatus,
} from '@prisma/client';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import {
  ConduitApiClient,
  type ConduitSendContext,
} from '../../conduit/client/conduit-api.client';
import { conduitIdempotencyKey } from '../../conduit/client/conduit-idempotency-key';
import { formatNotificationDateTime } from '../utils/format-notification-date';
import { AutomationExecutionRepository } from '../repositories/automation-execution.repository';
import { assertMessageDelivered } from '../utils/assert-message-delivered';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { ReactivationJobData } from '../listeners/schedule-reactivation.listener';
import { ConsentService } from 'src/clients/consent/consent.service';
import { CONDUIT_TEMPLATE_IDS } from '../domain/conduit-template-ids.constants';
import {
  AdminDepositTimeoutNoticeJobData,
  AdminClientCancellationNoticeJobData,
  AdminRescheduleNoticeJobData,
  AdminHandoffNoticeJobData,
  CancellationLinkNoticeJobData,
  ClientCancellationNoticeJobData,
  ClientDepositRejectedNoticeJobData,
  RescheduleNoticeJobData,
} from '../domain/operational-notifications.constants';
import { OperationalNotificationsService } from '../operational-notifications.service';

interface ReminderJobData {
  reservationId: string;
  scheduledStart?: string;
}

type AutomationJobData =
  | ReminderJobData
  | ReactivationJobData
  | AdminDepositTimeoutNoticeJobData
  | ClientDepositRejectedNoticeJobData
  | RescheduleNoticeJobData
  | AdminRescheduleNoticeJobData
  | ClientCancellationNoticeJobData
  | AdminClientCancellationNoticeJobData
  | CancellationLinkNoticeJobData
  | AdminHandoffNoticeJobData;
@Processor(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
export class AutomationCommunicationsProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationCommunicationsProcessor.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly conduitApiClient: ConduitApiClient,
    private readonly executions: AutomationExecutionRepository,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly notifications: OperationalNotificationsService,
  ) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<void> {
    const ctx: ConduitSendContext = {
      idempotencyKey: conduitIdempotencyKey(job),
      companyEventId: `${job.name}:${job.id}`,
    };

    switch (job.name) {
      case JOB_NAMES.RESERVATION_REMINDER_CHECK:
        return this.sendReminder(
          (job.data as ReminderJobData).reservationId,
          ctx,
          job.data as ReminderJobData,
          job.timestamp,
        );
      case JOB_NAMES.REACTIVATION_CHECK:
        return this.checkReactivation(job.data as ReactivationJobData, ctx);
      case JOB_NAMES.NOTIFY_ADMIN_DEPOSIT_TIMEOUT:
        return this.notifications.notifyAdminDepositTimeout(
          job.data as AdminDepositTimeoutNoticeJobData,
          ctx,
        );
      case JOB_NAMES.NOTIFY_CLIENT_DEPOSIT_REJECTED:
        return this.notifications.notifyClientDepositRejected(
          job.data as ClientDepositRejectedNoticeJobData,
          ctx,
        );
      case JOB_NAMES.NOTIFY_CLIENT_RESCHEDULED:
        return this.notifications.notifyClientRescheduled(
          job.data as RescheduleNoticeJobData,
          ctx,
        );
      case JOB_NAMES.NOTIFY_ADMIN_RESCHEDULED:
        return this.notifications.notifyAdminRescheduled(
          job.data as AdminRescheduleNoticeJobData,
          ctx,
        );
      case JOB_NAMES.NOTIFY_CLIENT_CANCELLATION_CONFIRMED:
        return this.notifications.notifyClientCancellationConfirmed(
          job.data as ClientCancellationNoticeJobData,
          ctx,
        );
      case JOB_NAMES.NOTIFY_ADMIN_CLIENT_CANCELLED:
        return this.notifications.notifyAdminClientCancelled(
          job.data as AdminClientCancellationNoticeJobData,
          ctx,
        );
      case JOB_NAMES.NOTIFY_ADMIN_HANDOFF:
        return this.notifications.notifyAdminHandoff(
          job.data as AdminHandoffNoticeJobData,
          ctx,
        );
      case JOB_NAMES.SEND_CLIENT_CANCELLATION_LINK:
        return this.notifications.sendClientCancellationLink(
          job.data as CancellationLinkNoticeJobData,
          ctx,
        );
      default:
        this.logger.warn(`Job desconocido recibido: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AutomationJobData> | undefined, error: Error) {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal =
      error instanceof UnrecoverableError || job.attemptsMade >= maxAttempts;

    if (!isFinal) {
      this.logger.warn(
        `Intento ${job.attemptsMade}/${maxAttempts} fallido para "${job.name}" (${job.id}): ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `"${job.name}" (${job.id}) falla permanente tras ${job.attemptsMade} intento(s): ${error.message}`,
      error.stack,
    );

    const type = this.resolveExecutionType(job.name);
    if (!type) return;

    await this.executions.log({
      type,
      result: AutomationExecutionResult.FAILED,
      reservationId: (job.data as { reservationId?: string }).reservationId,
      clientId: (job.data as { clientId?: string }).clientId,
      errorMessage: error.message,
    });
  }

  private resolveExecutionType(
    jobName: string,
  ): AutomationExecutionType | null {
    switch (jobName) {
      case JOB_NAMES.RESERVATION_REMINDER_CHECK:
        return AutomationExecutionType.RESERVATION_REMINDER;
      case JOB_NAMES.REACTIVATION_CHECK:
        return AutomationExecutionType.REACTIVATION;
      case JOB_NAMES.NOTIFY_ADMIN_DEPOSIT_TIMEOUT:
        return AutomationExecutionType.ADMIN_DEPOSIT_TIMEOUT_NOTICE;
      case JOB_NAMES.NOTIFY_CLIENT_DEPOSIT_REJECTED:
        return AutomationExecutionType.CLIENT_DEPOSIT_REJECTED_NOTICE;
      case JOB_NAMES.NOTIFY_CLIENT_RESCHEDULED:
        return AutomationExecutionType.CLIENT_RESCHEDULE_NOTICE;
      case JOB_NAMES.NOTIFY_ADMIN_RESCHEDULED:
        return AutomationExecutionType.ADMIN_RESCHEDULE_NOTICE;
      case JOB_NAMES.NOTIFY_CLIENT_CANCELLATION_CONFIRMED:
        return AutomationExecutionType.CLIENT_CANCELLATION_NOTICE;
      case JOB_NAMES.NOTIFY_ADMIN_CLIENT_CANCELLED:
        return AutomationExecutionType.ADMIN_CLIENT_CANCELLATION_NOTICE;
      case JOB_NAMES.SEND_CLIENT_CANCELLATION_LINK:
        return AutomationExecutionType.CLIENT_CANCELLATION_LINK_NOTICE;
      case JOB_NAMES.NOTIFY_ADMIN_HANDOFF:
        return AutomationExecutionType.ADMIN_HANDOFF_NOTICE;
      default:
        return null;
    }
  }

  private async checkReactivation(
    data: ReactivationJobData,
    ctx: ConduitSendContext,
  ) {
    const type = AutomationExecutionType.REACTIVATION;
    const base = {
      type,
      clientId: data.clientId,
      automationRuleId: data.automationRuleId,
    };

    const rule = await this.prisma.client.automationRule.findUnique({
      where: { id: data.automationRuleId },
      include: { promotion: true },
    });

    if (!rule || !rule.isActive) {
      await this.executions.log({
        ...base,
        result: AutomationExecutionResult.SKIPPED,
        reason: 'La regla ya no existe o está inactiva',
      });
      return;
    }

    const client = await this.prisma.client.client.findUnique({
      where: { id: data.clientId },
    });
    if (!client) {
      await this.executions.log({
        ...base,
        result: AutomationExecutionResult.SKIPPED,
        reason: 'El cliente ya no existe',
      });
      return;
    }

    const triggering = await this.reservationsRepository.findById(
      data.triggeringReservationId,
    );
    const since = triggering?.completedAt ?? new Date(0);
    const hasReturned =
      await this.reservationsRepository.hasMoreRecentActivityInCategory(
        data.clientId,
        data.categoryId,
        since,
      );
    if (hasReturned) {
      await this.executions.log({
        ...base,
        result: AutomationExecutionResult.SKIPPED,
        reason: 'El cliente ya tuvo actividad más reciente en esta categoría',
      });
      return;
    }

    if (
      await this.executions.hasExecutedForRule(
        type,
        data.clientId,
        data.automationRuleId,
      )
    ) {
      await this.executions.log({
        ...base,
        result: AutomationExecutionResult.SKIPPED,
        reason: 'Esta reactivación ya se envió antes',
      });
      return;
    }

    const hasMarketingConsent = await this.consentService.hasMarketingConsent(
      data.clientId,
    );
    if (!hasMarketingConsent) {
      await this.executions.log({
        ...base,
        result: AutomationExecutionResult.SKIPPED,
        reason: 'El cliente no ha dado consentimiento de marketing',
      });
      return;
    }

    const promo = rule.promotion;
    const now = new Date();
    const hasValidPromo =
      promo?.isActive && promo.startsAt <= now && now <= promo.endsAt;

    const result = await this.conduitApiClient.sendWhatsappMessage({
      ...ctx,
      phone: client.phone,
      templateId: hasValidPromo
        ? CONDUIT_TEMPLATE_IDS.REACTIVATION_WITH_PROMO
        : CONDUIT_TEMPLATE_IDS.REACTIVATION,
      variables: hasValidPromo
        ? {
            nombre: client.name,
            dias: String(rule.reactivationDays),
            promocion: promo.name,
            descuento: promo.discountPercentage.toString(),
          }
        : { nombre: client.name, dias: String(rule.reactivationDays) },
    });

    try {
      assertMessageDelivered(result);
    } catch (error) {
      await this.executions.log({
        ...base,
        result: AutomationExecutionResult.FAILED,
        errorMessage: (error as Error).message,
      });
      throw error;
    }

    // Se registra EXECUTED solo tras el envío: si se registrara antes, un
    // fallo de Conduit dejaría el reintento convencido de que ya se envió.
    await this.executions.log({
      ...base,
      result: AutomationExecutionResult.EXECUTED,
      promotionId: hasValidPromo ? promo.id : undefined,
    });
  }

  private async sendReminder(
    reservationId: string,
    ctx: ConduitSendContext,
    reminder: ReminderJobData,
    queuedAt: number,
  ) {
    const type = AutomationExecutionType.RESERVATION_REMINDER;
    const reservation =
      await this.reservationsRepository.findByIdWithClientPhone(reservationId);

    if (!reservation || reservation.status !== ReservationStatus.CONFIRMADA) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reservationId,
        reason: reservation
          ? `Ya no está CONFIRMADA (está en ${reservation.status})`
          : 'La reserva ya no existe',
      });
      return;
    }

    if (
      reminder.scheduledStart &&
      new Date(reminder.scheduledStart).getTime() !==
        reservation.scheduledStart.getTime()
    ) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reservationId,
        reason:
          'La cita se reagendó; este recordatorio era para la fecha anterior',
      });
      return;
    }

    if (
      await this.executions.hasExecuted(
        type,
        reservationId,
        reminder.scheduledStart ? new Date(queuedAt) : undefined,
      )
    ) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reservationId,
        reason: 'El recordatorio ya se envió antes',
      });
      return;
    }

    const result = await this.conduitApiClient.sendWhatsappMessage({
      ...ctx,
      phone: reservation.client.phone,
      templateId: CONDUIT_TEMPLATE_IDS.RESERVATION_REMINDER,
      variables: {
        nombre: reservation.client.name,
        fecha: formatNotificationDateTime(reservation.scheduledStart),
      },
    });

    try {
      assertMessageDelivered(result);
    } catch (error) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.FAILED,
        reservationId,
        errorMessage: (error as Error).message,
      });
      throw error;
    }

    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reservationId,
    });
  }
}
