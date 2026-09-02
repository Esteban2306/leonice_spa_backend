import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
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

@Injectable()
export class ScheduleReminderListener {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
  ) {}

  @OnEvent(EVENT_TYPES.RESERVATION_CONFIRMED)
  async handleReservationConfirmed(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CONFIRMED>,
  ) {
    const reservation = await this.prisma.client.reservation.findUnique({
      where: { id: event.payload.reservationId },
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
      event.payload.scheduledStart.getTime() -
      reminderDays * 24 * 60 * 60 * 1000 -
      Date.now();

    if (delay <= 0) return;

    await this.queue.add(
      JOB_NAMES.RESERVATION_REMINDER_CHECK,
      { reservationId: event.payload.reservationId },
      { delay },
    );
  }
}
