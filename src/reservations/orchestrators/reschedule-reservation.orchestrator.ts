import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { validateAdvancedWindow } from '../validators/validate-advance-window';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';
import { ReservationRescheduler } from '../service/reservation-rescheduler.service';

@Injectable()
export class RescheduleReservationOrchestrator {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly rescheduler: ReservationRescheduler,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(reservationId: string, phone: string, newScheduledStart: Date) {
    const original =
      await this.reservationsRepository.findByIdWithClientPhone(reservationId);
    if (!original) throw new NotFoundException('Reserva no encontrada');

    if (normalizePhone(phone) !== original.client.phone) {
      throw new ForbiddenException(
        'No se pudo verificar la propiedad de esta reserva',
      );
    }

    validateAdvancedWindow(newScheduledStart);

    const { reservation, previousScheduledStart } =
      await this.rescheduler.execute(reservationId, newScheduledStart);

    this.eventBus.publish(EVENT_TYPES.RESERVATION_RESCHEDULED, {
      originalReservationId: reservation.id,
      newReservationId: reservation.id,
      clientId: reservation.clientId,
      newScheduledStart: reservation.scheduledStart,
      previousScheduledStart,
    });

    return reservation;
  }
}
