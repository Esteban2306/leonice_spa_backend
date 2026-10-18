import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENT_TYPES,
  EventPayloadMap,
} from '../../common/events/constants/event.types';
import type { EventOf } from '../../common/events/interface/event.interface';
import { ConduitOutboxService } from '../service/conduit-outbox.service';

@Injectable()
export class ConduitOutboxListener {
  constructor(private readonly outbox: ConduitOutboxService) {}

  @OnEvent(EVENT_TYPES.RESERVATION_CREATED)
  async handleCreated(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CREATED>,
  ) {
    await this.outbox.enqueue('reservation.created', {
      reservationId: event.payload.reservationId,
      clientPhone: event.payload.clientPhone,
      treatmentId: event.payload.treatmentId,
      status: event.payload.status,
      scheduledStart: event.payload.scheduledStart,
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CONFIRMED)
  async handleConfirmed(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CONFIRMED>,
  ) {
    await this.outbox.enqueue('reservation.confirmed', {
      reservationId: event.payload.reservationId,
      clientId: event.payload.clientId,
      scheduledStart: event.payload.scheduledStart,
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED)
  async handleCancelled(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CANCELLED>,
  ) {
    await this.outbox.enqueue('reservation.cancelled', {
      reservationId: event.payload.reservationId,
      clientId: event.payload.clientId,
      reason: event.payload.reason,
      cancelledBy: 'CLIENT',
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED_BY_BUSINESS)
  async handleCancelledByBusiness(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_CANCELLED_BY_BUSINESS
    >,
  ) {
    await this.outbox.enqueue('reservation.cancelled', {
      reservationId: event.payload.reservationId,
      clientId: event.payload.clientId,
      reason: event.payload.reason,
      cancelledBy: event.payload.source,
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_RESCHEDULED)
  async handleRescheduledByClient(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_RESCHEDULED>,
  ) {
    await this.outbox.enqueue('reservation.rescheduled', {
      reservationId: event.payload.newReservationId,
      clientId: event.payload.clientId,
      previousScheduledStart: event.payload.previousScheduledStart,
      scheduledStart: event.payload.newScheduledStart,
      rescheduledBy: 'CLIENT',
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN)
  async handleRescheduledByAdmin(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN
    >,
  ) {
    await this.outbox.enqueue('reservation.rescheduled', {
      reservationId: event.payload.reservationId,
      clientId: event.payload.clientId,
      previousScheduledStart: event.payload.previousScheduledStart,
      scheduledStart: event.payload.newScheduledStart,
      rescheduledBy: 'ADMIN',
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_NO_SHOW)
  async handleNoShow(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_NO_SHOW>,
  ) {
    await this.outbox.enqueue('reservation.no_show', {
      reservationId: event.payload.reservationId,
      clientId: event.payload.clientId,
      scheduledStart: event.payload.scheduledStart,
    });
  }

  @OnEvent(EVENT_TYPES.RESERVATION_COMPLETED)
  async handleCompleted(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_COMPLETED>,
  ) {
    await this.outbox.enqueue('reservation.completed', {
      reservationId: event.payload.reservationId,
      clientId: event.payload.clientId,
      treatmentId: event.payload.treatmentId,
    });
  }
}
