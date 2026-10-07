import { Injectable } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';

@Injectable()
export class MarkNoShowOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) return;

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.NO_SHOW,
    );

    const applied = await this.repository.updateStatusIfCurrent(
      reservationId,
      reservation.status,
      { status: ReservationStatus.NO_SHOW },
    );
    if (!applied) return;

    const updated = await this.repository.findById(reservationId);
    if (!updated) return;

    this.eventBus.publish(EVENT_TYPES.RESERVATION_NO_SHOW, {
      reservationId: updated.id,
      clientId: updated.clientId,
      scheduledStart: updated.scheduledStart,
    });
    return updated;
  }
}
