import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENT_TYPES,
  type EventPayloadMap,
} from '../../common/events/constants/event.types';
import type { EventOf } from '../../common/events/interface/event.interface';

@Injectable()
export class ReservationEventsListener {
  private readonly logger = new Logger(ReservationEventsListener.name);

  @OnEvent(EVENT_TYPES.RESERVATION_COMPLETED)
  handleCompleted(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_COMPLETED>,
  ) {
    this.logger.log(
      `Reserva ${event.payload.reservationId} completada — pendiente conectar recomendaciones [${event.correlationId}]`,
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_NEEDS_HAIR_PROFILE)
  handleNeedsHairProfile(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_NEEDS_HAIR_PROFILE
    >,
  ) {
    this.logger.warn(
      `Reserva ${event.payload.reservationId} (${event.payload.treatmentName}) necesita revisión de cabello antes de confirmar precio — contactar a ${event.payload.clientPhone} [cita: ${event.payload.scheduledStart.toISOString()}]`,
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED)
  handleCancelled(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CANCELLED>,
  ) {
    this.logger.log(
      `Reserva ${event.payload.reservationId} cancelada: ${event.payload.reason ?? 'sin razón especificada'}`,
    );
  }

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED_BY_ADMIN)
  handleCancelledByAdmin(
    event: EventOf<
      EventPayloadMap,
      typeof EVENT_TYPES.RESERVATION_CANCELLED_BY_ADMIN
    >,
  ) {
    this.logger.log(
      `Reserva ${event.payload.reservationId} cancelada por el administrador: ${event.payload.reason} — pendiente notificar al cliente vía Conduit`,
    );
  }
}
