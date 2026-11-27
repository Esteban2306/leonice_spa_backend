import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { orderCode } from '../product-orders/domain/order-pricing';
import {
  describeItems,
  formatPesos,
} from '../product-orders/domain/order-text';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  CancellationSource,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { LATEST_DEPOSIT_ORDER } from '../reservations/repositories/reservation.selects';
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
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ANONYMIZED_PHONE_PREFIX } from '../client-privacy/anonymized-client';
import { formatNotificationDateTime } from './utils/format-notification-date';
import { isProofUnderReview } from 'src/reservations/domain/group-reservations-for-display';
import { remindsForCombo } from 'src/reservations/domain/deposit-reminder';
import {
  OPERATIONAL_EMAIL_TEMPLATE_ENV_KEYS,
  OPERATIONAL_TEMPLATE_ENV_KEYS,
  type AdminDepositTimeoutNoticeJobData,
  type AdminClientCancellationNoticeJobData,
  type AdminHandoffNoticeJobData,
  type AdminInProgressNoticeJobData,
  type ClientEventTicketNoticeJobData,
  type AdminProductPurchaseNoticeJobData,
  type AdminProductPaymentNoticeJobData,
  type ClientProductPaymentNoticeJobData,
  type AdminReceiptNoticeJobData,
  type AdminRescheduleNoticeJobData,
  type CancellationChannel,
  type CancellationLinkNoticeJobData,
  type ClientCancellationNoticeJobData,
  type ClientCancelledByAdminNoticeJobData,
  type ClientDepositRejectedNoticeJobData,
  type ClientReservationConfirmedNoticeJobData,
  type ClientDepositReminderJobData,
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

interface NoticeRecipient {
  phone: string;
  email: string | null;
}

/** Names the person when the appointment is for someone other than the contact: "Spa Capilar (para Sofía)". */
export function treatmentLabel(r: {
  treatment: { name: string };
  dependent?: { name: string } | null;
}): string {
  return r.dependent
    ? `${r.treatment.name} (para ${r.dependent.name})`
    : r.treatment.name;
}

@Injectable()
export class OperationalNotificationsService {
  private readonly logger = new Logger(OperationalNotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly conduit: ConduitApiClient,
    private readonly reservations: ReservationsRepository,
    private readonly recipients: AdminNotificationRecipientsRepository,
    private readonly executions: AutomationExecutionRepository,
    private readonly templates: ConduitTemplateResolver,
    private readonly prisma: PrismaService,
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

    await this.notifyRecipient(ctx, 'ADMIN_DEPOSIT_TIMEOUT', recipient, {
      cliente: first.client.name,
      telefono: first.client.phone,
      tratamientos: details.map(treatmentLabel).join(', '),
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

  async notifyClientReservationConfirmed(
    data: ClientReservationConfirmedNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_RESERVATION_CONFIRMED_NOTICE;
    const { reservationId } = data;

    const reservation = await this.loadWithDetails(reservationId);
    if (!reservation) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }

    const groupIds = reservation.comboGroupId
      ? (
          await this.reservations.findByComboGroupId(reservation.comboGroupId)
        ).map((r) => r.id)
      : [reservation.id];
    const confirmed = (
      await this.reservations.findManyByIdsWithDetails(groupIds)
    )
      .filter((r) => r.status === ReservationStatus.CONFIRMADA)
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
    const first = confirmed[0];
    if (!first) {
      await this.skip(
        type,
        reservationId,
        `Ya no está confirmada (está en ${reservation.status}); el aviso de aceptación ya no aplica`,
      );
      return;
    }

    await this.send(ctx, 'CLIENT_RESERVATION_CONFIRMED', first.client.phone, {
      nombre: first.client.name,
      tratamiento: confirmed.map(treatmentLabel).join(', '),
      fecha: formatNotificationDateTime(first.scheduledStart),
    });
    await this.executed(type, reservationId);
  }

  async notifyClientDepositReminder(
    data: ClientDepositReminderJobData,
    ctx: ConduitSendContext,
    now: Date = new Date(),
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_DEPOSIT_REMINDER;
    const { reservationId } = data;

    const settings = await this.prisma.client.businessSettings.findUnique({
      where: { id: 'default' },
      select: { depositReminderEnabled: true },
    });
    if (settings && !settings.depositReminderEnabled) {
      await this.skip(
        type,
        reservationId,
        'Recordatorio de anticipo apagado en el panel',
      );
      return;
    }

    const reservation = await this.loadWithDetails(reservationId);
    if (!reservation) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }
    if (reservation.status !== ReservationStatus.PENDIENTE_DEPOSITO) {
      await this.skip(
        type,
        reservationId,
        `Ya no espera anticipo (está en ${reservation.status})`,
      );
      return;
    }
    const expiresAt = reservation.depositExpiresAt;
    if (!expiresAt || expiresAt.toISOString() !== data.expiresAt) {
      await this.skip(
        type,
        reservationId,
        'El plazo del anticipo cambió; se recuerda con el plazo nuevo',
      );
      return;
    }
    if (expiresAt.getTime() <= now.getTime()) {
      await this.skip(type, reservationId, 'El plazo del anticipo ya venció');
      return;
    }
    if (reservation.client.phone.startsWith(ANONYMIZED_PHONE_PREFIX)) {
      await this.skip(type, reservationId, 'Clienta anonimizada');
      return;
    }

    const members = reservation.comboGroupId
      ? await this.reservations.findManyByIdsWithDetails(
          (
            await this.reservations.findByComboGroupId(reservation.comboGroupId)
          ).map((r) => r.id),
        )
      : [reservation];
    const pending = members.filter(
      (r) => r.status === ReservationStatus.PENDIENTE_DEPOSITO,
    );
    if (remindsForCombo(pending)?.id !== reservation.id) {
      await this.skip(
        type,
        reservationId,
        'El recordatorio del combo va con su primer servicio',
      );
      return;
    }

    const [latestProof] = await this.prisma.client.depositRecord.findMany({
      where: { reservationId: { in: members.map((r) => r.id) } },
      orderBy: LATEST_DEPOSIT_ORDER,
      take: 1,
      select: { status: true, imageUrl: true },
    });
    if (
      isProofUnderReview(reservation.status, latestProof ? [latestProof] : [])
    ) {
      await this.skip(
        type,
        reservationId,
        'Ya envió el comprobante y está en revisión',
      );
      return;
    }

    const ordered = [...pending].sort(
      (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime(),
    );
    await this.send(ctx, 'CLIENT_DEPOSIT_REMINDER', reservation.client.phone, {
      nombre: reservation.client.name.split(/\s+/)[0],
      tratamiento: ordered.map(treatmentLabel).join(', '),
      fecha: formatNotificationDateTime(ordered[0].scheduledStart),
      plazo: `el ${formatNotificationDateTime(expiresAt)}`,
    });
    await this.executed(type, reservationId);
  }

  async notifyClientCancelledByAdmin(
    data: ClientCancelledByAdminNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_CANCELLED_BY_ADMIN_NOTICE;
    const { reservationId, reason } = data;

    const reservation = await this.loadWithDetails(reservationId);
    if (!reservation) {
      await this.skip(type, reservationId, RESERVATION_GONE_REASON);
      return;
    }
    if (reservation.status !== ReservationStatus.CANCELADA) {
      await this.skip(
        type,
        reservationId,
        `Ya no está cancelada (está en ${reservation.status}); el aviso de cancelación ya no aplica`,
      );
      return;
    }

    await this.send(
      ctx,
      'CLIENT_CANCELLED_BY_ADMIN',
      reservation.client.phone,
      {
        nombre: reservation.client.name,
        tratamiento: treatmentLabel(reservation),
        fecha: formatNotificationDateTime(reservation.scheduledStart),
        motivo: reason,
      },
    );
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
      tratamiento: treatmentLabel(reservation),
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

    await this.notifyRecipient(ctx, 'ADMIN_RESCHEDULED', recipient, {
      cliente: reservation.client.name,
      telefono: reservation.client.phone,
      tratamiento: treatmentLabel(reservation),
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
      tratamientos: cancelled.map(treatmentLabel).join(', '),
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

    await this.notifyRecipient(ctx, 'ADMIN_CLIENT_CANCELLED', recipient, {
      cliente: first.client.name,
      telefono: first.client.phone,
      tratamientos: cancelled.map(treatmentLabel).join(', '),
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

    await this.notifyRecipient(ctx, 'ADMIN_HANDOFF', recipient, {
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

  /** Una clienta pidió comprar un producto: el equipo la contacta. */
  async notifyClientEventTicket(
    data: ClientEventTicketNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    await this.notifyEventTicket(
      data.ticketId,
      ctx,
      AutomationExecutionType.CLIENT_EVENT_TICKET_NOTICE,
      'CLIENT_EVENT_TICKET',
    );
  }

  async notifyClientEventWinner(
    data: ClientEventTicketNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    await this.notifyEventTicket(
      data.ticketId,
      ctx,
      AutomationExecutionType.CLIENT_EVENT_WINNER_NOTICE,
      'CLIENT_EVENT_WINNER',
    );
  }

  private async notifyEventTicket(
    ticketId: string,
    ctx: ConduitSendContext,
    type: AutomationExecutionType,
    template: 'CLIENT_EVENT_TICKET' | 'CLIENT_EVENT_WINNER',
  ): Promise<void> {
    const ticket = await this.prisma.client.eventTicket.findUnique({
      where: { id: ticketId },
      select: {
        number: true,
        prize: true,
        wonAt: true,
        reservationId: true,
        clientId: true,
        event: { select: { name: true } },
        client: { select: { name: true, phone: true } },
      },
    });
    const log = (
      result: AutomationExecutionResult,
      reason: string,
    ): Promise<unknown> =>
      this.executions.log({
        type,
        result,
        reservationId: ticket?.reservationId ?? undefined,
        clientId: ticket?.clientId,
        reason,
      });

    if (!ticket) {
      await log(AutomationExecutionResult.SKIPPED, 'La boleta ya no existe');
      return;
    }
    if (template === 'CLIENT_EVENT_WINNER' && !ticket.wonAt) {
      await log(AutomationExecutionResult.SKIPPED, 'La boleta no es ganadora');
      return;
    }
    if (ticket.client.phone.startsWith(ANONYMIZED_PHONE_PREFIX)) {
      await log(
        AutomationExecutionResult.SKIPPED,
        'La clienta fue anonimizada',
      );
      return;
    }

    const templateId = await this.templates.resolve(
      OPERATIONAL_TEMPLATE_ENV_KEYS[template],
    );
    if (!templateId) {
      throw new UnrecoverableError(
        `No hay plantilla de Conduit para ${OPERATIONAL_TEMPLATE_ENV_KEYS[template]}: créala con pnpm seed`,
      );
    }
    const result = await this.conduit.sendWhatsappMessage({
      phone: ticket.client.phone,
      templateId,
      variables: {
        nombre: ticket.client.name,
        evento: ticket.event.name,
        boleta: String(ticket.number),
        ...(template === 'CLIENT_EVENT_WINNER'
          ? { premio: ticket.prize ?? 'un premio' }
          : {}),
      },
      idempotencyKey: `${ctx.idempotencyKey}:${template}`,
      companyEventId: ctx.companyEventId,
    });
    if (!result.delivered && result.permanent) {
      await log(
        AutomationExecutionResult.SKIPPED,
        `WhatsApp no aceptó el mensaje: ${result.reason ?? 'sin detalle'}`,
      );
      return;
    }
    assertMessageDelivered(result);
    await log(
      AutomationExecutionResult.EXECUTED,
      `${ticket.event.name}: boleta #${ticket.number}`,
    );
  }

  async notifyAdminInProgress(
    data: AdminInProgressNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_IN_PROGRESS_NOTICE;
    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: RECIPIENT_INACTIVE_REASON,
      });
      return;
    }

    const shown = data.lines.length;
    const more =
      data.total > shown ? `\n…y ${data.total - shown} más en el panel` : '';
    await this.notifyRecipient(ctx, 'ADMIN_IN_PROGRESS', recipient, {
      cantidad: String(data.total),
      citas: `${data.lines.join('\n')}${more}`,
    });
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reason: `Destinatario ${recipient.id}, cierre ${data.digestId}: ${data.total} cita(s) en curso`,
    });
  }

  async notifyAdminProductPurchase(
    data: AdminProductPurchaseNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_PRODUCT_PURCHASE_NOTICE;
    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: RECIPIENT_INACTIVE_REASON,
      });
      return;
    }

    await this.notifyRecipient(ctx, 'ADMIN_PRODUCT_PURCHASE', recipient, {
      cliente: data.clientName ?? 'Cliente sin registrar',
      telefono:
        data.phone ?? `(número oculto por WhatsApp, LID ${data.lid ?? '?'})`,
      pedido: data.request,
      notas: data.notes ?? 'Sin notas',
    });
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reason: `Destinatario ${recipient.id}`,
    });
  }

  async notifyAdminProductPayment(
    data: AdminProductPaymentNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_PRODUCT_PAYMENT_NOTICE;
    const [recipient, order] = await Promise.all([
      this.findActiveRecipient(data.recipientId),
      this.loadProductOrder(data.orderId),
    ]);
    if (!recipient || !order) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: !recipient
          ? RECIPIENT_INACTIVE_REASON
          : 'El pedido ya no existe',
      });
      return;
    }
    const total = order.total === null ? null : Number(order.total);
    const paid = order.proofAmount === null ? null : Number(order.proofAmount);
    await this.notifyRecipient(ctx, 'ADMIN_PRODUCT_PAYMENT', recipient, {
      cliente: order.clientName ?? 'Cliente sin registrar',
      telefono:
        order.phone ?? `(número oculto por WhatsApp, LID ${order.lid ?? '?'})`,
      pedido: orderCode(order.number),
      productos: describeItems(order.items),
      total: total === null ? 'por confirmar' : formatPesos(total),
      pagado:
        paid === null
          ? 'no se leyó el monto'
          : `${formatPesos(paid)}${total !== null && paid < total ? ' ⚠️ menor que el total' : ''}`,
      comprobante: order.proofImageUrl ?? 'sin imagen',
      panel: this.ordersPanelUrl(),
    });
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reason: `Destinatario ${recipient.id}`,
    });
  }

  async notifyClientProductPaymentRejected(
    data: ClientProductPaymentNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_PRODUCT_PAYMENT_REJECTED_NOTICE;
    const order = await this.loadProductOrder(data.orderId);
    if (!order?.phone) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: order
          ? 'El pedido no tiene teléfono (contacto con LID): avísale desde el chat'
          : 'El pedido ya no existe',
      });
      return;
    }
    await this.send(ctx, 'CLIENT_PRODUCT_PAYMENT_REJECTED', order.phone, {
      nombre: order.clientName?.split(' ')[0] ?? 'hola',
      pedido: orderCode(order.number),
      motivo: data.reason ?? 'no pudimos validarlo',
    });
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      clientId: order.clientId ?? undefined,
      reason: `Pedido ${orderCode(order.number)}`,
    });
  }

  async notifyClientProductOrderReady(
    data: ClientProductPaymentNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.CLIENT_PRODUCT_PAYMENT_VERIFIED_NOTICE;
    const order = await this.loadProductOrder(data.orderId);
    if (!order?.phone) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: order
          ? 'El pedido no tiene teléfono (contacto con LID): avísale desde el chat'
          : 'El pedido ya no existe',
      });
      return;
    }
    await this.send(ctx, 'CLIENT_PRODUCT_ORDER_READY', order.phone, {
      nombre: order.clientName?.split(' ')[0] ?? 'hola',

      detalle:
        data.detail ?? `tu pedido *${orderCode(order.number)}* ya está listo.`,
    });
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      clientId: order.clientId ?? undefined,
      reason: `Pedido ${orderCode(order.number)} listo`,
    });
  }

  private loadProductOrder(id: string) {
    return this.prisma.client.productOrder.findUnique({
      where: { id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  private ordersPanelUrl(): string {
    const base = this.config.get<string>('FRONTEND_ADMIN_URL') ?? '';
    return base
      ? `${base.replace(/\/+$/, '')}/admin/orders`
      : 'Panel > Pedidos';
  }

  /** Un comprobante quedó en revisión o la clienta lleva varios rechazos. */
  async notifyAdminReceiptIssue(
    data: AdminReceiptNoticeJobData,
    ctx: ConduitSendContext,
  ): Promise<void> {
    const type = AutomationExecutionType.ADMIN_RECEIPT_NOTICE;
    const recipient = await this.findActiveRecipient(data.recipientId);
    if (!recipient) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reason: RECIPIENT_INACTIVE_REASON,
      });
      return;
    }

    const base = {
      cliente: data.clientName ?? 'Cliente sin registrar',
      telefono: data.phone ?? 'Número oculto por WhatsApp',
      motivo: data.reason,
    };
    if (data.kind === 'RETRIES') {
      await this.notifyRecipient(ctx, 'ADMIN_RECEIPT_RETRIES', recipient, {
        ...base,
        intentos: String(data.attempts),
      });
    } else {
      await this.notifyRecipient(ctx, 'ADMIN_RECEIPT_REVIEW', recipient, base);
    }
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
      tratamiento: treatmentLabel(reservation),
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

  private async notifyRecipient(
    ctx: ConduitSendContext,
    template: OperationalTemplate,
    recipient: NoticeRecipient,
    variables: Record<string, string>,
  ): Promise<void> {
    await this.send(ctx, template, recipient.phone, variables);
    if (recipient.email) {
      await this.sendEmail(ctx, template, recipient.email, variables);
    }
  }

  private async sendEmail(
    ctx: ConduitSendContext,
    template: OperationalTemplate,
    email: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const envKey = OPERATIONAL_EMAIL_TEMPLATE_ENV_KEYS[template];
    if (!envKey) return;
    const templateId = await this.templates.resolve(envKey);
    if (!templateId) {
      this.logger.warn(
        `No hay plantilla de correo en Conduit para ${envKey}: el aviso salió solo por WhatsApp`,
      );
      return;
    }

    const result = await this.conduit.sendEmailMessage({
      email,
      templateId,
      variables,
      idempotencyKey: `${ctx.idempotencyKey}:${template}:EMAIL`,
      companyEventId: ctx.companyEventId,
    });
    if (result.permanent) {
      this.logger.warn(
        `Conduit rechazó el correo de ${template}: ${result.reason ?? 'sin detalle'}. El aviso salió por WhatsApp`,
      );
      return;
    }
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
