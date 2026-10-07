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
import { ConduitApiClient } from 'src/conduit/client/conduit-api.client';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { ReservationStateMachine } from 'src/reservations/domain/reservation-state-machine';
import { DEPOSITO_TIMEOUT_MS } from 'src/reservations/domain/reservation-timing.constants';
import { AdminNotificationRecipientsRepository } from 'src/admin-notifications/repository/admin-notification-recipients.repository';
import { AutomationExecutionRepository } from './repositories/automation-execution.repository';
import { assertMessageDelivered } from './utils/assert-message-delivered';
import { formatNotificationDateTime } from './utils/format-notification-date';
import { describeDepositWindow } from './utils/describe-deposit-window';
import {
  OPERATIONAL_TEMPLATE_ENV_KEYS,
  type AdminDepositTimeoutNoticeJobData,
  type AdminRescheduleNoticeJobData,
  type ClientDepositRejectedNoticeJobData,
  type OperationalTemplate,
  type RescheduleNoticeJobData,
} from './domain/operational-notifications.constants';

const RECIPIENT_INACTIVE_REASON =
  'El destinatario fue desactivado o eliminado antes del envío';
const RESERVATION_GONE_REASON = 'La reserva ya no existe';

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
  ) {}

  async notifyAdminDepositTimeout(
    data: AdminDepositTimeoutNoticeJobData,
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

    await this.send('ADMIN_DEPOSIT_TIMEOUT', recipient.phone, {
      cliente: first.client.name,
      telefono: first.client.phone,
      tratamientos: details.map((r) => r.treatment.name).join(', '),
      fecha: formatNotificationDateTime(first.scheduledStart),
    });
    await this.executed(type, reservationId, `Destinatario ${recipient.id}`);
  }

  async notifyClientDepositRejected(
    data: ClientDepositRejectedNoticeJobData,
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

    if (hasDeadline) {
      await this.send('CLIENT_DEPOSIT_REJECTED', reservation.client.phone, {
        nombre: reservation.client.name,
        plazo: describeDepositWindow(DEPOSITO_TIMEOUT_MS),
      });
    } else {
      await this.send(
        'CLIENT_DEPOSIT_REJECTED_NO_DEADLINE',
        reservation.client.phone,
        { nombre: reservation.client.name },
      );
    }
    await this.executed(type, reservationId);
  }

  async notifyClientRescheduled(data: RescheduleNoticeJobData): Promise<void> {
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

    await this.send('CLIENT_RESCHEDULED', reservation.client.phone, {
      nombre: reservation.client.name,
      tratamiento: reservation.treatment.name,
      fecha: formatNotificationDateTime(reservation.scheduledStart),
    });
    await this.executed(type, reservationId);
  }

  async notifyAdminRescheduled(
    data: AdminRescheduleNoticeJobData,
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

    await this.send('ADMIN_RESCHEDULED', recipient.phone, {
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
    template: OperationalTemplate,
    phone: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const envKey = OPERATIONAL_TEMPLATE_ENV_KEYS[template];
    const templateId = this.config.get<string>(envKey);
    if (!templateId) {
      throw new UnrecoverableError(
        `Falta configurar la variable de entorno ${envKey}`,
      );
    }

    const result = await this.conduit.sendWhatsappMessage({
      phone,
      templateId,
      variables,
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
