import { Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { DomainException } from '../../common/exceptions/domain.exception';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';

@Injectable()
export class AdminRescheduleReservationOrchestrator {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(
    reservationId: string,
    newScheduledStart: Date,
    notifyClient: boolean,
    internalNote?: string,
  ) {
    const reservation =
      await this.reservationsRepository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (ReservationStateMachine.isTerminal(reservation.status)) {
      throw new DomainException(
        `No se puede reprogramar una reserva en estado terminal (${reservation.status})`,
      );
    }

    const newScheduledEnd = new Date(
      newScheduledStart.getTime() + reservation.finalDurationMinutes * 60_000,
    );

    const updated = await this.availabilityRepository.withCategoryLock(
      reservation.categoryId,
      newScheduledStart,
      (tx) =>
        this.reservationsRepository.updateSchedule(
          reservationId,
          { scheduledStart: newScheduledStart, scheduledEnd: newScheduledEnd },
          tx,
        ),
    );

    if (notifyClient) {
      this.eventBus.publish(EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN, {
        reservationId: updated.id,
        clientId: updated.clientId,
        newScheduledStart: updated.scheduledStart,
        internalNote,
      });
    }

    return updated;
  }
}
