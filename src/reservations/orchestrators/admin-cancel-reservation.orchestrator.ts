import { Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';

const DEFAULT_ADMIN_CANCEL_REASON = 'Cancelado por el administrador';

@Injectable()
export class AdminCancelReservationOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(
    reservationId: string,
    reason: string | undefined,
    notifyClient: boolean,
  ) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CANCELADA,
    );

    const updated = await this.repository.updateStatus(reservationId, {
      status: ReservationStatus.CANCELADA,
      cancelledAt: new Date(),
      cancellationReason: reason ?? DEFAULT_ADMIN_CANCEL_REASON,
    });

    if (notifyClient) {
      this.eventBus.publish(EVENT_TYPES.RESERVATION_CANCELLED_BY_ADMIN, {
        reservationId: updated.id,
        clientId: updated.clientId,
        reason: updated.cancellationReason ?? undefined,
      });
    }

    return updated;
  }
}
