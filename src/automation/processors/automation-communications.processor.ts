import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
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
import { ConduitApiClient } from '../../conduit/client/conduit-api.client';
import { AutomationExecutionRepository } from '../repositories/automation-execution.repository';
import { assertMessageDelivered } from '../utils/assert-message-delivered';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { ReactivationJobData } from '../listeners/schedule-reactivation.listener';
import { ConsentService } from 'src/clients/consent/consent.service';
import { CONDUIT_TEMPLATE_IDS } from '../domain/conduit-template-ids.constants';

interface ReminderJobData {
  reservationId: string;
}

type AutomationJobData = ReminderJobData | ReactivationJobData;

@Processor(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
export class AutomationCommunicationsProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationCommunicationsProcessor.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly conduitApiClient: ConduitApiClient,
    private readonly executions: AutomationExecutionRepository,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
  ) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<void> {
    switch (job.name) {
      case JOB_NAMES.RESERVATION_REMINDER_CHECK:
        return this.sendReminder((job.data as ReminderJobData).reservationId);
      case JOB_NAMES.REACTIVATION_CHECK:
        return this.checkReactivation(job.data as ReactivationJobData);
      default:
        this.logger.warn(`Job desconocido recibido: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AutomationJobData> | undefined, error: Error) {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      this.logger.warn(
        `Intento ${job.attemptsMade}/${maxAttempts} fallido para "${job.name}" (${job.id}): ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `"${job.name}" (${job.id}) agotó sus ${maxAttempts} intentos: ${error.message}`,
      error.stack,
    );

    const type =
      job.name === JOB_NAMES.RESERVATION_REMINDER_CHECK
        ? AutomationExecutionType.RESERVATION_REMINDER
        : job.name === JOB_NAMES.REACTIVATION_CHECK
          ? AutomationExecutionType.REACTIVATION
          : null;
    if (!type) return;

    await this.executions.log({
      type,
      result: AutomationExecutionResult.FAILED,
      reservationId: (job.data as { reservationId?: string }).reservationId,
      clientId: (job.data as { clientId?: string }).clientId,
      errorMessage: error.message,
    });
  }

  private async checkReactivation(data: ReactivationJobData) {
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

    await this.executions.log({
      ...base,
      result: AutomationExecutionResult.EXECUTED,
      promotionId: hasValidPromo ? promo.id : undefined,
    });

    const result = await this.conduitApiClient.sendWhatsappMessage({
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

    await this.executions.log({
      ...base,
      result: AutomationExecutionResult.EXECUTED,
    });
  }

  private async sendReminder(reservationId: string) {
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

    if (await this.executions.hasExecuted(type, reservationId)) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reservationId,
        reason: 'El recordatorio ya se envió antes',
      });
      return;
    }

    const result = await this.conduitApiClient.sendWhatsappMessage({
      phone: reservation.client.phone,
      templateId: CONDUIT_TEMPLATE_IDS.RESERVATION_REMINDER,
      variables: {
        nombre: reservation.client.name,
        fecha: reservation.scheduledStart.toISOString(),
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
