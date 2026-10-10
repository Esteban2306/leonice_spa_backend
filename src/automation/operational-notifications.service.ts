import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  CancellationSource,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import {
  ConduitApiClient,
  type ConduitSendContext,
} from 'src/conduit/client/conduit-api.client';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { ReservationStateMachine } from 'src/reservations/domain/reservation-state-machine';
import { AdminNotificationRecipientsRepository } from 'src/admin-notifications/repository/admin-notification-recipients.repository';
import { AutomationExecutionRepository } from './repositories/automation-execution.repository';
import { ConduitTemplateResolver } from '../conduit/templates/conduit-template-resolver';
import { assertMessageDelivered } from './utils/assert-message-delivered';
import { formatNotificationDateTime } from './utils/format-notification-date';
import {
  OPERATIONAL_TEMPLATE_ENV_KEYS,
  type AdminDepositTimeoutNoticeJobData,
  type AdminClientCancellationNoticeJobData,
  type AdminHandoffNoticeJobData,
  type AdminRescheduleNoticeJobData,
  type CancellationChannel,
  type CancellationLinkNoticeJobData,
  type ClientCancellationNoticeJobData,
  type ClientDepositRejectedNoticeJobData,
  type OperationalTemplate,
  type RescheduleNoticeJobData,
} from './domain/operational-notifications.constants';

const RECIPIENT_INACTIVE_REASON =
  'El destinatario fue desactivado o eliminado antes del envío';
const RESERVATION_GONE_REASON = 'La reserva ya no existe';

const CHANNEL_LABELS: Record<CancellationChannel, string> = {
  WEB: 'la web',
  LINK: 'el enlace de cancelación',
  WHATSAPP: 'WhatsApp',
};

function isCancelledByClient(
  reservation: Pick<Reservation, 'status' | 'cancellationSource'>,
): boolean {
  return (
    reservation.status === ReservationStatus.CANCELADA &&
    reservation.cancellationSource === CancellationSource.CLIENT
  );
}

function isCancelledByTimeout(
  reservation: Pick<Reservation, 'status' | 'cancellationSource'>,
): boolean {
  return (
    reservation.status === ReservationStatus.CANCELADA &&
    reservation.cancellationSource === CancellationSource.TIMEOUT
  );
}

@Injectable()
export class OperationalNotificationsService {
  constructor(
    private readonly config: ConfigService,
    private readonly conduit: ConduitApiClient,
    private readonly reservations: ReservationsRepository,
    private readonly recipients: AdminNotificationRecipientsRepository,
    private readonly executions: AutomationExecutionRepository,
    private readonly templates: ConduitTemplateResolver,
  ) {}

  async notifyAdminDepositTimeout(
    data: AdminDepositTimeoutNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_DEPOSIT_TIMEOUT_NOTICE;
    const { reservationId } = data;

    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.skip(type, reservationId, RECIPIENT_INACTIVE_REASON);
      return;
    }

    const target = await this.reservations.findById(reservationId);
    if (!target) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }

    const candidates = target.comboGroupId
      ? await this.reservations.findByComboGroupId(target.comboGroupId)
      : [target];
    const cancelledIds = candidates
      .filter(isCancelledByTimeout)
      .map((r) => r.id);
    if (cancelledIds.length === 0) {
      await this.skip(
        type,
        reservationId,
        'Ya no está cancelada por vencimiento (fue revivida o cambió)',
      );
      return;
    }

    const details =
      await this.reservations.findManyByIdsWithDetails(cancelledIds);
    const first = details[0];
    if (!first) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }

    await this.send(ctx, 'ADMIN_DEPOSIT_TIMEOUT', recipient.phone, {
      cliente: first.client.name,
      telefono: first.client.phone,
      tratamientos: details.map((r) => r.treatment.name).join(', '),
      fecha: formatNotificationDateTime(first.scheduledStart),
    });
    await this.executed(type, reservationId, `Destinatario ${recipient.id}`);
  }

  async notifyClientDepositRejected(
    data: ClientDepositRejectedNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_DEPOSIT_REJECTED_NOTICE;
    const { reservationId, hasDeadline } = data;

    const reservation = await this.loadWithDetails(reservationId);
    if (!reservation) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }

    if (
      hasDeadline &&
      reservation.status !== ReservationStatus.PENDIENTE_DEPOSITO
    ) {
      await this.skip(
        type,
        reservationId,
        `Ya no espera depósito (está en ${reservation.status}); el aviso con plazo ya no aplica`,
      );
      return;
    }

    if (hasDeadline && reservation.depositExpiresAt) {
      await this.send(
        ctx,
        'CLIENT_DEPOSIT_REJECTED',
        reservation.client.phone,
        {
          nombre: reservation.client.name,
          plazo: `hasta el ${formatNotificationDateTime(reservation.depositExpiresAt)}`,
        },
      );
    } else {
      await this.send(
        ctx,
        'CLIENT_DEPOSIT_REJECTED_NO_DEADLINE',
        reservation.client.phone,
        { nombre: reservation.client.name },
      );
    }
    await this.executed(type, reservationId);
  }

  async notifyClientRescheduled(
    data: RescheduleNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_RESCHEDULE_NOTICE;
    const { reservationId } = data;

    const reservation = await this.loadWithDetails(reservationId);
    if (!reservation) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }
    if (ReservationStateMachine.isTerminal(reservation.status)) {
      await this.skip(
        type,
        reservationId,
        `La reserva ya está en estado final (${reservation.status})`,
      );
      return;
    }

    await this.send(ctx, 'CLIENT_RESCHEDULED', reservation.client.phone, {
      nombre: reservation.client.name,
      tratamiento: reservation.treatment.name,
      fecha: formatNotificationDateTime(reservation.scheduledStart),
    });
    await this.executed(type, reservationId);
  }

  async notifyAdminRescheduled(
    data: AdminRescheduleNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_RESCHEDULE_NOTICE;
    const { reservationId } = data;

    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.skip(type, reservationId, RECIPIENT_INACTIVE_REASON);
      return;
    }

    const reservation = await this.loadWithDetails(reservationId);
    if (!reservation) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }
    if (ReservationStateMachine.isTerminal(reservation.status)) {
      await this.skip(
        type,
        reservationId,
        `La reserva ya está en estado final (${reservation.status})`,
      );
      return;
    }

    await this.send(ctx, 'ADMIN_RESCHEDULED', recipient.phone, {
      cliente: reservation.client.name,
      telefono: reservation.client.phone,
      tratamiento: reservation.treatment.name,
      fecha_anterior: formatNotificationDateTime(
        new Date(data.previousScheduledStart),
      ),
      fecha_nueva: formatNotificationDateTime(reservation.scheduledStart),
      origen: data.source === 'CLIENT' ? 'el cliente' : 'el administrador',
    });
    await this.executed(type, reservationId, `Destinatario ${recipient.id}`);
  }

  async notifyClientCancellationConfirmed(
    data: ClientCancellationNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_CANCELLATION_NOTICE;
    const cancelled = await this.loadClientCancelled(data.reservationIds);
    const first = cancelled[0];
    if (!first) {
      await this.skip(
        type,
        data.reservationId,
        'Las reservas ya no están canceladas por el cliente',
      );
      return;
    }

    await this.send(ctx, 'CLIENT_CANCELLATION_CONFIRMED', first.client.phone, {
      nombre: first.client.name,
      tratamientos: cancelled.map((r) => r.treatment.name).join(', '),
      fecha: formatNotificationDateTime(first.scheduledStart),
    });
    await this.executed(type, data.reservationId);
  }

  async notifyAdminClientCancelled(
    data: AdminClientCancellationNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_CLIENT_CANCELLATION_NOTICE;
    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.skip(type, data.reservationId, RECIPIENT_INACTIVE_REASON);
      return;
    }

    const cancelled = await this.loadClientCancelled(data.reservationIds);
    const first = cancelled[0];
    if (!first) {
      await this.skip(
        type,
        data.reservationId,
        'Las reservas ya no están canceladas por el cliente',
      );
      return;
    }

    await this.send(ctx, 'ADMIN_CLIENT_CANCELLED', recipient.phone, {
      cliente: first.client.name,
      telefono: first.client.phone,
      tratamientos: cancelled.map((r) => r.treatment.name).join(', '),
      fecha: formatNotificationDateTime(first.scheduledStart),
      canal: CHANNEL_LABELS[data.channel],
    });
    await this.executed(
      type,
      data.reservationId,
      `Destinatario ${recipient.id}`,
    );
  }

  /** La clienta pidió (o el bot decidió) hablar con una persona. */
  async notifyAdminHandoff(
    data: AdminHandoffNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_HANDOFF_NOTICE;
    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: RECIPIENT_INACTIVE_REASON,
      });
      return;
    }

    await this.send(ctx, 'ADMIN_HANDOFF', recipient.phone, {
      cliente: data.clientName ?? 'Cliente sin registrar',
      telefono:
        data.phone ?? `(número oculto por WhatsApp, LID ${data.lid ?? '?'})`,
      motivo: data.reason,
      resumen: data.summary ?? 'Sin resumen',
    });
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reason: `Destinatario ${recipient.id}`,
    });
  }

  async sendClientCancellationLink(
    data: CancellationLinkNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_CANCELLATION_LINK_NOTICE;
    const reservation = await this.loadWithDetails(data.reservationId);
    if (!reservation) {
      await this.skip(type, data.reservationId, RESERVATION_GONE_REASON);
      return;
    }
    if (ReservationStateMachine.isTerminal(reservation.status)) {
      await this.skip(
        type,
        data.reservationId,
        `La reserva ya está en estado final (${reservation.status})`,
      );
      return;
    }

    await this.send(ctx, 'CLIENT_CANCELLATION_LINK', reservation.client.phone, {
      nombre: reservation.client.name,
      tratamiento: reservation.treatment.name,
      fecha: formatNotificationDateTime(reservation.scheduledStart),
      enlace: data.url,
    });
    await this.executed(type, data.reservationId);
  }

  private async loadClientCancelled(reservationIds: string[]) {
    const rows =
      await this.reservations.findManyByIdsWithDetails(reservationIds);
    return rows.filter(isCancelledByClient);
  }

  private async findActiveRecipient(recipientId: string) {
    const recipient = await this.recipients.findById(recipientId);
    return recipient?.isActive ? recipient : null;
  }

  private async loadWithDetails(reservationId: string) {
    const [reservation] = await this.reservations.findManyByIdsWithDetails([
      reservationId,
    ]);
    return reservation ?? null;
  }

  private async send(
    ctx: ConduitSendContext,
    template: OperationalTemplate,
    phone: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const envKey = OPERATIONAL_TEMPLATE_ENV_KEYS[template];
    const templateId = await this.templates.resolve(envKey);
    if (!templateId) {
      throw new UnrecoverableError(
        `No hay plantilla de Conduit para ${envKey}: créala con pnpm seed o define la variable`,
      );
    }

    const result = await this.conduit.sendWhatsappMessage({
      phone,
      templateId,
      variables,
      idempotencyKey: `${ctx.idempotencyKey}:${template}`,
      companyEventId: ctx.companyEventId,
    });
    assertMessageDelivered(result);
  }

  private skip(
    type: AutomationExecutionType,
    reservationId: string,
    reason: string,
  ) {
    return this.executions.log({
      type,
      result: AutomationExecutionResult.SKIPPED,
      reservationId,
      reason,
    });
  }

  private executed(
    type: AutomationExecutionType,
    reservationId: string,
    reason?: string,
  ) {
    return this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reservationId,
      reason,
    });
  }
}
