import { Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';

@Injectable()
export class CompleteReservationOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.COMPLETADA,
    );

    const updated = await this.repository.updateStatus(reservationId, {
      status: ReservationStatus.COMPLETADA,
      completedAt: new Date(),
    });

    this.eventBus.publish(EVENT_TYPES.RESERVATION_COMPLETED, {
      reservationId: updated.id,
      clientId: updated.clientId,
      treatmentId: updated.treatmentId,
      categoryId: updated.categoryId,
    });
    return updated;
  }
}
