import { Injectable } from '@nestjs/common';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { ReservationRescheduler } from '../service/reservation-rescheduler.service';

@Injectable()
export class AdminRescheduleReservationOrchestrator {
  constructor(
    private readonly rescheduler: ReservationRescheduler,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(
    reservationId: string,
    newScheduledStart: Date,
    notifyClient: boolean,
    internalNote?: string,
  ) {
    const { reservation, previousScheduledStart } =
      await this.rescheduler.execute(reservationId, newScheduledStart);

    this.eventBus.publish(EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN, {
      reservationId: reservation.id,
      clientId: reservation.clientId,
      previousScheduledStart,
      newScheduledStart: reservation.scheduledStart,
      notifyClient,
      internalNote,
    });

    return reservation;
  }
}
