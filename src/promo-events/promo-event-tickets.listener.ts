import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENT_TYPES,
  type EventPayloadMap,
} from '../common/events/constants/event.types';
import type { EventOf } from '../common/events/interface/event.interface';
import { PromoEventTicketsService } from './promo-event-tickets.service';

@Injectable()
export class PromoEventTicketsListener {
  private readonly logger = new Logger(PromoEventTicketsListener.name);

  constructor(private readonly tickets: PromoEventTicketsService) {}

  @OnEvent(EVENT_TYPES.RESERVATION_COMPLETED)
  async handleCompleted(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_COMPLETED>,
  ): Promise<void> {
    try {
      const numbers = await this.tickets.issueForCompletedReservation(
        event.payload.reservationId,
      );
      if (numbers.length > 0) {
        this.logger.log(
          `Reserva ${event.payload.reservationId}: boleta(s) ${numbers.map((n) => `#${n}`).join(', ')}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo entregar la boleta de la reserva ${event.payload.reservationId}: ${message}`,
      );
    }
  }
}
