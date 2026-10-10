import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { ReservationStatus } from '@prisma/client';
import {
  EVENT_TYPES,
  EventPayloadMap,
} from '../../common/events/constants/event.types';
import type { EventOf } from '../../common/events/interface/event.interface';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DEFAULT_REMINDER_DAYS } from '../domain/automation-timing.constants';

export const reminderJobId = (reservationId: string) =>
  `reservation-reminder-${reservationId}`;

@Injectable()
export class ScheduleReminderListener {
  private readonly logger = new Logger(ScheduleReminderListener.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
  ) {}

  @OnEvent(EVENT_TYPES.RESERVATION_CONFIRMED)
  async handleReservationConfirmed(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CONFIRMED>,
  ) {
    await this.scheduleReminder(
      event.payload.reservationId,
      event.payload.scheduledStart,
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_RESCHEDULED)
  async handleRescheduledByClient(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_RESCHEDULED>,
  ) {
    await this.rescheduleReminder(
      event.payload.newReservationId,
      event.payload.newScheduledStart,
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN)
  async handleRescheduledByAdmin(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN
    >,
  ) {
    await this.rescheduleReminder(
      event.payload.reservationId,
      event.payload.newScheduledStart,
    );
  }

  private async rescheduleReminder(
    reservationId: string,
    scheduledStart: Date,
  ): Promise<void> {
    try {
      const reservation = await this.prisma.client.reservation.findUnique({
        where: { id: reservationId },
        select: { status: true },
      });
      if (reservation?.status !== ReservationStatus.CONFIRMADA) return;
      await this.scheduleReminder(reservationId, scheduledStart);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo reprogramar el recordatorio de ${reservationId}: ${message}`,
      );
    }
  }

  private async scheduleReminder(
    reservationId: string,
    scheduledStart: Date,
  ): Promise<void> {
    const reservation = await this.prisma.client.reservation.findUnique({
      where: { id: reservationId },
      select: { treatmentId: true, categoryId: true },
    });
    if (!reservation) return;

    const rule =
      (await this.prisma.client.automationRule.findFirst({
        where: {
          isActive: true,
          reminderDays: { not: null },
          treatmentId: reservation.treatmentId,
        },
      })) ??
      (await this.prisma.client.automationRule.findFirst({
        where: {
          isActive: true,
          reminderDays: { not: null },
          categoryId: reservation.categoryId,
        },
      }));

    const reminderDays = rule?.reminderDays ?? DEFAULT_REMINDER_DAYS;
    const delay =
      scheduledStart.getTime() -
      reminderDays * 24 * 60 * 60 * 1000 -
      Date.now();

    const jobId = reminderJobId(reservationId);
    const previous = await this.queue.getJob(jobId);
    if (previous && !(await previous.isActive())) await previous.remove();

    if (delay <= 0) return;

    await this.queue.add(
      JOB_NAMES.RESERVATION_REMINDER_CHECK,
      { reservationId, scheduledStart: scheduledStart.toISOString() },
      { delay, jobId },
    );
  }
}
