import { Injectable, NotFoundException } from '@nestjs/common';
import { CancellationSource, ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { AppException } from '../../common/errors/app.exception';

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
    source: CancellationSource = CancellationSource.ADMIN,
  ) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CANCELADA,
    );

    const applied = await this.repository.updateStatusIfCurrent(
      reservationId,
      reservation.status,
      {
        status: ReservationStatus.CANCELADA,
        cancelledAt: new Date(),
        cancellationReason: reason ?? DEFAULT_ADMIN_CANCEL_REASON,
        cancellationSource: source,
      },
    );
    if (!applied) {
      throw new AppException('RESERVATION_CONCURRENT_CHANGE');
    }

    const updated = await this.repository.findById(reservationId);
    if (!updated) throw new NotFoundException('Reserva no encontrada');

    if (source === CancellationSource.TIMEOUT) {
      this.eventBus.publish(EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT, {
        reservationId: updated.id,
        clientId: updated.clientId,
        comboGroupId: updated.comboGroupId,
      });
    }

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
