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
import { AdminNotificationRecipientsRepository } from 'src/admin-notifications/repository/admin-notification-recipients.repository';
import {
  ADMIN_TIMEOUT_NOTICE_DELAY_MS,
  NOTICE_JOB_OPTIONS,
  type AdminDepositTimeoutNoticeJobData,
  type AdminRescheduleNoticeJobData,
  type ClientDepositRejectedNoticeJobData,
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
  private async enqueueClientRescheduled(
    data: RescheduleNoticeJobData,
  ): Promise<void> {
    await this.queue.add(JOB_NAMES.NOTIFY_CLIENT_RESCHEDULED, data, {
      ...NOTICE_JOB_OPTIONS,
    });
  }

  private async enqueueForAdmins<T extends object>(
    jobName: string,
    label: string,
    build: (recipientId: string) => AdminJobSpec<T>,
  ): Promise<void> {
    const active = await this.recipients.findActive();
    if (active.length === 0) {
      this.logger.warn(
        `Aviso "${label}" sin enviar: no hay destinatarios admin activos`,
      );
      return;
    }
    for (const recipient of active) {
      try {
        const { data, opts } = build(recipient.id);
        await this.queue.add(jobName, data, { ...NOTICE_JOB_OPTIONS, ...opts });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `No se pudo encolar el aviso "${label}" para el destinatario ${recipient.id}: ${message}`,
        );
      }
    }
  }

  private async guard(
    label: string,
    reservationId: string,
    fn: () => Promise<void>,
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
