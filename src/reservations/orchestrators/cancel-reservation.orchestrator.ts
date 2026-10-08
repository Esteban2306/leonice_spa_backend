import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CancellationSource, ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';

@Injectable()
export class CancelReservationOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(reservationId: string, phone: string, reason?: string) {
    const reservation =
      await this.repository.findByIdWithClientPhone(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (normalizePhone(phone) !== reservation.client.phone) {
      throw new ForbiddenException(
        'No se pudo verificar la propiedad de esta reserva',
      );
    }

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CANCELADA,
    );

    const updated = await this.repository.updateStatus(reservationId, {
      status: ReservationStatus.CANCELADA,
      cancelledAt: new Date(),
      cancellationReason: reason,
      cancellationSource: CancellationSource.CLIENT,
    });

    this.eventBus.publish(EVENT_TYPES.RESERVATION_CANCELLED, {
      reservationId: updated.id,
      clientId: updated.clientId,
      reason: updated.cancellationReason ?? undefined,
    });
    return updated;
  }
}
