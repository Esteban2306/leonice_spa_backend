import { Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { AppException } from '../../common/errors/app.exception';

@Injectable()
export class CompleteReservationOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (reservation.status === ReservationStatus.COMPLETADA) {
      return reservation;
    }

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.COMPLETADA,
    );

    const applied = await this.repository.updateStatusIfCurrent(
      reservationId,
      reservation.status,
      { status: ReservationStatus.COMPLETADA, completedAt: new Date() },
    );
    if (!applied) {
      throw new AppException('RESERVATION_CONCURRENT_CHANGE');
    }

    const updated = await this.repository.findById(reservationId);
    if (!updated) throw new NotFoundException('Reserva no encontrada');

    this.eventBus.publish(EVENT_TYPES.RESERVATION_COMPLETED, {
      reservationId: updated.id,
      clientId: updated.clientId,
      treatmentId: updated.treatmentId,
      categoryId: updated.categoryId,
    });
    return updated;
  }
}
