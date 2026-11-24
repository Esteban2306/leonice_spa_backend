import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { JobsOptions, Queue } from 'bullmq';
import {
  EVENT_TYPES,
  type EventPayloadMap,
} from '../../common/events/constants/event.types';
import type { EventOf } from '../../common/events/interface/event.interface';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { inProgressLine } from '../domain/in-progress-line';
import { ownerRecipients } from '../domain/owner-recipients';
import { AdminNotificationRecipientsRepository } from 'src/admin-notifications/repository/admin-notification-recipients.repository';
import {
  ADMIN_TIMEOUT_NOTICE_DELAY_MS,
  NOTICE_JOB_OPTIONS,
  type AdminDepositTimeoutNoticeJobData,
  type AdminClientCancellationNoticeJobData,
  type AdminRescheduleNoticeJobData,
  type AdminHandoffNoticeJobData,
  type AdminInProgressNoticeJobData,
  type AdminProductPurchaseNoticeJobData,
  type AdminProductPaymentNoticeJobData,
  type ClientProductPaymentNoticeJobData,
  type AdminReceiptNoticeJobData,
  type CancellationLinkNoticeJobData,
  type ClientCancellationNoticeJobData,
  type ClientCancelledByAdminNoticeJobData,
  type ClientDepositRejectedNoticeJobData,
  type ClientReservationConfirmedNoticeJobData,
  type RescheduleNoticeJobData,
} from '../domain/operational-notifications.constants';
interface AdminJobSpec<T extends object> {
  data: T;
  opts?: JobsOptions;
}
@Injectable()
export class OperationalNotificationsListener {
  private readonly logger = new Logger(OperationalNotificationsListener.name);
  constructor(
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
    private readonly recipients: AdminNotificationRecipientsRepository,
  ) {}

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT)
  async handleCancelledByTimeout(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT
    >,
  ): Promise<void> {
    const { reservationId, comboGroupId } = event.payload;
    const dedupeKey = comboGroupId ?? reservationId;
    await this.guard('aviso admin por timeout', reservationId, () =>
      this.enqueueForAdmins<AdminDepositTimeoutNoticeJobData>(
        JOB_NAMES.NOTIFY_ADMIN_DEPOSIT_TIMEOUT,
        'timeout de depósito',
        (recipientId) => ({
          data: { reservationId, recipientId },
          opts: {
            jobId: `admin-timeout-${dedupeKey}-${recipientId}`,
            delay: ADMIN_TIMEOUT_NOTICE_DELAY_MS,
          },
        }),
      ),
    );
  }

  @OnEvent(EVENT_TYPES.DEPOSIT_REJECTED) async handleDepositRejected(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.DEPOSIT_REJECTED>,
  ): Promise<void> {
    const { reservationId, newDeadline } = event.payload;
    const data: ClientDepositRejectedNoticeJobData = {
      reservationId,
      hasDeadline: newDeadline !== null,
    };
    await this.guard('aviso cliente por rechazo', reservationId, async () => {
      await this.queue.add(JOB_NAMES.NOTIFY_CLIENT_DEPOSIT_REJECTED, data, {
        ...NOTICE_JOB_OPTIONS,
      });
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CONFIRMED)
  async handleReservationConfirmed(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CONFIRMED>,
  ): Promise<void> {
    const { reservationId, comboGroupId, withoutDeposit } = event.payload;
    if (withoutDeposit) return;
    const data: ClientReservationConfirmedNoticeJobData = { reservationId };
    await this.guard(
      'aviso cliente por cita aceptada',
      reservationId,
      async () => {
        await this.queue.add(
          JOB_NAMES.NOTIFY_CLIENT_RESERVATION_CONFIRMED,
          data,
          {
            ...NOTICE_JOB_OPTIONS,
            jobId: `client-confirmed-${comboGroupId ?? reservationId}`,
          },
        );
      },
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED_BY_ADMIN)
  async handleCancelledByAdmin(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_CANCELLED_BY_ADMIN
    >,
  ): Promise<void> {
    const { reservationId, reason } = event.payload;
    if (!reason) return;
    const data: ClientCancelledByAdminNoticeJobData = { reservationId, reason };
    await this.guard(
      'aviso cliente por cancelación del spa',
      reservationId,
      async () => {
        await this.queue.add(JOB_NAMES.NOTIFY_CLIENT_CANCELLED_BY_ADMIN, data, {
          ...NOTICE_JOB_OPTIONS,
          jobId: `client-cancelled-${reservationId}`,
        });
      },
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_RESCHEDULED)
  async handleRescheduledByClient(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_RESCHEDULED>,
  ): Promise<void> {
    const { newReservationId, previousScheduledStart } = event.payload;
    const previousIso = previousScheduledStart.toISOString();

    await this.guard(
      'avisos por reagendar (cliente)',
      newReservationId,
      async () => {
        await this.enqueueClientRescheduled({
          reservationId: newReservationId,
          previousScheduledStart: previousIso,
        });
        await this.enqueueForAdmins<AdminRescheduleNoticeJobData>(
          JOB_NAMES.NOTIFY_ADMIN_RESCHEDULED,
          'reagendar',
          (recipientId) => ({
            data: {
              reservationId: newReservationId,
              previousScheduledStart: previousIso,
              recipientId,
              source: 'CLIENT',
            },
          }),
        );
      },
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN)
  async handleRescheduledByAdmin(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN
    >,
  ): Promise<void> {
    const { reservationId, previousScheduledStart, notifyClient } =
      event.payload;
    const previousIso = previousScheduledStart.toISOString();
    await this.guard(
      'avisos por reagendar (admin)',
      reservationId,
      async () => {
        if (notifyClient) {
          await this.enqueueClientRescheduled({
            reservationId,
            previousScheduledStart: previousIso,
          });
        }
        await this.enqueueForAdmins<AdminRescheduleNoticeJobData>(
          JOB_NAMES.NOTIFY_ADMIN_RESCHEDULED,
          'reagendar',
          (recipientId) => ({
            data: {
              reservationId,
              previousScheduledStart: previousIso,
              recipientId,
              source: 'ADMIN',
            },
          }),
        );
      },
    );
  }
  @OnEvent(EVENT_TYPES.CLIENT_CANCELLATION_COMPLETED)
  async handleClientCancellation(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.CLIENT_CANCELLATION_COMPLETED
    >,
  ): Promise<void> {
    const { reservationIds, channel } = event.payload;
    const reservationId = reservationIds[0];
    if (!reservationId) return;
    const dedupeKey = [...reservationIds].sort().join('_');
    const data: ClientCancellationNoticeJobData = {
      reservationId,
      reservationIds,
      channel,
    };

    await this.guard(
      'avisos por cancelación del cliente',
      reservationId,
      async () => {
        await this.queue.add(
          JOB_NAMES.NOTIFY_CLIENT_CANCELLATION_CONFIRMED,
          data,
          {
            ...NOTICE_JOB_OPTIONS,
            jobId: `client-cancelled-${dedupeKey}`,
          },
        );
        await this.enqueueForAdmins<AdminClientCancellationNoticeJobData>(
          JOB_NAMES.NOTIFY_ADMIN_CLIENT_CANCELLED,
          'cancelación del cliente',
          (recipientId) => ({
            data: { ...data, recipientId },
            opts: {
              jobId: `admin-client-cancelled-${dedupeKey}-${recipientId}`,
            },
          }),
        );
      },
    );
  }

  @OnEvent(EVENT_TYPES.CANCELLATION_LINK_REQUESTED)
  async handleCancellationLinkRequested(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.CANCELLATION_LINK_REQUESTED
    >,
  ): Promise<void> {
    const { reservationId, url } = event.payload;
    const data: CancellationLinkNoticeJobData = { reservationId, url };
    await this.guard(
      'envío del enlace de cancelación',
      reservationId,
      async () => {
        await this.queue.add(JOB_NAMES.SEND_CLIENT_CANCELLATION_LINK, data, {
          ...NOTICE_JOB_OPTIONS,
        });
      },
    );
  }

  private async enqueueClientRescheduled(
    data: RescheduleNoticeJobData,
  ): Promise<void> {
    await this.queue.add(JOB_NAMES.NOTIFY_CLIENT_RESCHEDULED, data, {
      ...NOTICE_JOB_OPTIONS,
    });
  }

  @OnEvent(EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED)
  async handleHandoffRequested(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED
    >,
  ): Promise<boolean> {
    const { requestId, target, ...payload } = event.payload;
    try {
      const pick =
        target === 'OWNER'
          ? <T extends { name: string }>(active: T[]) => {
              const owners = ownerRecipients(active);
              if (owners.length > 0) return owners;
              this.logger.warn(
                'Aviso para Leo sin un administrador activo con su nombre: se avisa a todos los administradores.',
              );
              return active;
            }
          : undefined;
      const queued = await this.enqueueForAdmins<AdminHandoffNoticeJobData>(
        JOB_NAMES.NOTIFY_ADMIN_HANDOFF,
        target === 'OWNER' ? 'aviso para Leo' : 'traspaso a una persona',
        (recipientId) => ({
          data: { ...payload, recipientId },
          opts: { jobId: `admin-handoff-${requestId}-${recipientId}` },
        }),
        pick,
      );
      return queued > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo encolar el aviso de traspaso: ${message}`);
      return false;
    }
  }

  @OnEvent(EVENT_TYPES.RESERVATIONS_IN_PROGRESS_PENDING)
  async handleInProgressPending(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATIONS_IN_PROGRESS_PENDING
    >,
  ): Promise<boolean> {
    const { digestId, total, items } = event.payload;
    const lines = items.map(inProgressLine);
    try {
      const queued = await this.enqueueForAdmins<AdminInProgressNoticeJobData>(
        JOB_NAMES.NOTIFY_ADMIN_IN_PROGRESS,
        'citas en curso sin completar',
        (recipientId) => ({
          data: { recipientId, digestId, total, lines },
          opts: { jobId: `admin-in-progress-${digestId}-${recipientId}` },
        }),
      );
      return queued > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar el aviso de citas en curso: ${message}`,
      );
      return false;
    }
  }

  @OnEvent(EVENT_TYPES.CONDUIT_PRODUCT_PURCHASE_REQUESTED)
  async handleProductPurchaseRequested(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.CONDUIT_PRODUCT_PURCHASE_REQUESTED
    >,
  ): Promise<boolean> {
    const { requestId, ...payload } = event.payload;
    try {
      const queued =
        await this.enqueueForAdmins<AdminProductPurchaseNoticeJobData>(
          JOB_NAMES.NOTIFY_ADMIN_PRODUCT_PURCHASE,
          'solicitud de compra de producto',
          (recipientId) => ({
            data: { ...payload, recipientId },
            opts: {
              jobId: `admin-product-purchase-${requestId}-${recipientId}`,
            },
          }),
        );
      return queued > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar el aviso de compra de producto: ${message}`,
      );
      return false;
    }
  }

  @OnEvent(EVENT_TYPES.PRODUCT_ORDER_PAYMENT_RECEIVED)
  async handleProductPaymentReceived(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.PRODUCT_ORDER_PAYMENT_RECEIVED
    >,
  ): Promise<boolean> {
    const { orderId, proofReceivedAt } = event.payload;
    try {
      const queued =
        await this.enqueueForAdmins<AdminProductPaymentNoticeJobData>(
          JOB_NAMES.NOTIFY_ADMIN_PRODUCT_PAYMENT,
          'comprobante de un pedido de productos',
          (recipientId) => ({
            data: { orderId, recipientId },
            opts: {
              jobId: `admin-product-payment-${orderId}-${Date.parse(proofReceivedAt)}-${recipientId}`,
            },
          }),
        );
      return queued > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar el aviso del pago de un pedido: ${message}`,
      );
      return false;
    }
  }

  @OnEvent(EVENT_TYPES.PRODUCT_ORDER_PAYMENT_REJECTED)
  async handleProductPaymentRejected(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.PRODUCT_ORDER_PAYMENT_REJECTED
    >,
  ): Promise<void> {
    const data: ClientProductPaymentNoticeJobData = {
      orderId: event.payload.orderId,
      reason: event.payload.reason,
    };
    await this.guard(
      'aviso cliente por pago de pedido rechazado',
      data.orderId,
      async () => {
        await this.queue.add(
          JOB_NAMES.NOTIFY_CLIENT_PRODUCT_PAYMENT_REJECTED,
          data,
          {
            ...NOTICE_JOB_OPTIONS,
          },
        );
      },
    );
  }

  @OnEvent(EVENT_TYPES.PRODUCT_ORDER_VERIFIED)
  async handleProductOrderVerified(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.PRODUCT_ORDER_VERIFIED>,
  ): Promise<void> {
    const data: ClientProductPaymentNoticeJobData = {
      orderId: event.payload.orderId,
      detail: event.payload.detail,
    };
    await this.guard(
      'aviso cliente de pedido listo',
      data.orderId,
      async () => {
        await this.queue.add(
          JOB_NAMES.NOTIFY_CLIENT_PRODUCT_ORDER_READY,
          data,
          {
            ...NOTICE_JOB_OPTIONS,
            jobId: `client-product-ready-${data.orderId}`,
          },
        );
      },
    );
  }

  @OnEvent(EVENT_TYPES.CONDUIT_RECEIPT_ISSUE)
  async handleReceiptIssue(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.CONDUIT_RECEIPT_ISSUE>,
  ): Promise<boolean> {
    const { verificationId, ...payload } = event.payload;
    try {
      const queued = await this.enqueueForAdmins<AdminReceiptNoticeJobData>(
        JOB_NAMES.NOTIFY_ADMIN_RECEIPT_ISSUE,
        'comprobante que requiere atención',
        (recipientId) => ({
          data: { ...payload, recipientId },
          opts: {
            jobId: `admin-receipt-${payload.kind}-${verificationId}-${recipientId}`,
          },
        }),
      );
      return queued > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar el aviso de comprobante: ${message}`,
      );
      return false;
    }
  }

  private async enqueueForAdmins<T extends object>(
    jobName: string,
    label: string,
    build: (recipientId: string) => AdminJobSpec<T>,
    pick?: <R extends { name: string }>(active: R[]) => R[],
  ): Promise<number> {
    const all = await this.recipients.findActive();
    const active = pick && all.length > 0 ? pick(all) : all;
    if (active.length === 0) {
      this.logger.warn(
        `Aviso "${label}" sin enviar: no hay destinatarios admin activos`,
      );
      return 0;
    }
    let queued = 0;
    for (const recipient of active) {
      try {
        const { data, opts } = build(recipient.id);
        await this.queue.add(jobName, data, { ...NOTICE_JOB_OPTIONS, ...opts });
        queued += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `No se pudo encolar el aviso "${label}" para el destinatario ${recipient.id}: ${message}`,
        );
      }
    }
    return queued;
  }

  private async guard(
    label: string,
    reservationId: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falló el encolado de "${label}" para la reserva ${reservationId}: ${message}`,
      );
    }
  }
}
