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
import { alignToDaytime } from '../utils/align-to-daytime';

export interface ReactivationJobData {
  clientId: string;
  categoryId: string;
  automationRuleId: string;
  triggeringReservationId: string;
}

@Injectable()
export class ScheduleReactivationListener {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
  ) {}

  @OnEvent(EVENT_TYPES.RESERVATION_COMPLETED)
  async handleReservationCompleted(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_COMPLETED>,
  ) {
    const rules = await this.findApplicableRules(
      event.payload.treatmentId,
      event.payload.categoryId,
    );

    for (const rule of rules) {
      if (rule.reactivationDays === null) continue;
      const data: ReactivationJobData = {
        clientId: event.payload.clientId,
        categoryId: event.payload.categoryId,
        automationRuleId: rule.id,
        triggeringReservationId: event.payload.reservationId,
      };
      const dueAt = alignToDaytime(
        new Date(Date.now() + rule.reactivationDays * 24 * 60 * 60 * 1000),
      );
      await this.queue.add(JOB_NAMES.REACTIVATION_CHECK, data, {
        delay: dueAt.getTime() - Date.now(),
      });
    }
  }

  private async findApplicableRules(treatmentId: string, categoryId: string) {
    const treatmentRules = await this.prisma.client.automationRule.findMany({
      where: { isActive: true, treatmentId, reactivationDays: { not: null } },
    });
    if (treatmentRules.length > 0) return treatmentRules;

    return this.prisma.client.automationRule.findMany({
      where: {
        isActive: true,
        categoryId,
        treatmentId: null,
        reactivationDays: { not: null },
      },
    });
  }
}
