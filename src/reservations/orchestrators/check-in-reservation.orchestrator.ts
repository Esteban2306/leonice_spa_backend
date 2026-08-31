import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';

@Injectable()
export class CheckInReservationOrchestrator {
  private readonly logger = new Logger(CheckInReservationOrchestrator.name);
  constructor(private readonly repository: ReservationsRepository) {}

  async execute(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CITA_EN_CURSO,
    );

    if (reservation.status === ReservationStatus.NO_SHOW) {
      this.logger.warn(
        `Reserva ${reservationId} revivida desde NO_SHOW — el cliente llegó tarde y el admin decidió atenderlo igual`,
      );
    }

    return this.repository.updateStatus(reservationId, {
      status: ReservationStatus.CITA_EN_CURSO,
      checkedInAt: new Date(),
    });
  }
}
