import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { ReservationStatus } from '@prisma/client';
import { validateAdvancedWindow } from '../validators/validate-advance-window';
import { InsufficientCapacityException } from 'src/common/exceptions/insufficient-capacity.exception';
import { DomainException } from 'src/common/exceptions/domain.exception';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { getDayBoundaries } from '../domain/day-boundaries';
import { assertNoSameDayCategoryConflict } from '../validators/assert-no-same-day-category-conflict';
import { validateOperatingHours } from '../validators/validate-operating-hours';
import { overlapsAny, TimeInterval } from '../domain/personal-conflict-checker';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';

@Injectable()
export class RescheduleReservationOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly reservationsRepository: ReservationsRepository,
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

    ReservationStateMachine.assertTransition(
      original.status,
      ReservationStatus.REPROGRAMADA,
    );
    validateAdvancedWindow(newScheduledStart);

    const category = await this.prisma.client.category.findUniqueOrThrow({
      where: { id: original.categoryId },
    });

    const newScheduledEnd = new Date(
      newScheduledStart.getTime() + original.finalDurationMinutes * 60_000,
    );
    validateOperatingHours(newScheduledStart, newScheduledEnd);

    const newReservation = await this.availabilityRepository.withCategoryLock(
      original.categoryId,
      newScheduledStart,
      async (tx) => {
        const { dayStart, dayEnd } = getDayBoundaries(newScheduledStart);

        const hasConflict =
          await this.reservationsRepository.hasActiveReservationInCategoryOnDay(
            original.clientId,
            original.categoryId,
            dayStart,
            dayEnd,
            original.id,
            tx,
          );
        assertNoSameDayCategoryConflict(category.name, hasConflict);
        const existingIntervals: TimeInterval[] =
          await this.reservationsRepository.findActiveIntervalsForClientOnDay(
            original.clientId,
            dayStart,
            dayEnd,
            tx,
            original.id,
          );
        if (
          overlapsAny(newScheduledStart, newScheduledEnd, existingIntervals)
        ) {
          throw new DomainException(
            'Ya tienes otra reserva que se cruza con este horario. Elige una hora distinta.',
          );
        }

        const capacity =
          await this.availabilityRepository.getCapacityForCategory(
            original.categoryId,
            tx,
          );
        const concurrent =
          await this.availabilityRepository.getMaxConcurrentInWindow(
            tx,
            original.categoryId,
            newScheduledStart,
            newScheduledEnd,
          );
        if (concurrent >= capacity) {
          throw new InsufficientCapacityException(
            'Ya no hay cupo disponible para ese horario',
          );
        }

        const created = await tx.reservation.create({
          data: {
            clientId: original.clientId,
            categoryId: original.categoryId,
            treatmentId: original.treatmentId,
            status: original.status,
            channel: original.channel,
            scheduledStart: newScheduledStart,
            scheduledEnd: newScheduledEnd,
            finalPrice: original.finalPrice,
            finalDurationMinutes: original.finalDurationMinutes,
            rescheduledFromId: original.id,
          },
        });

        await tx.reservation.update({
          where: { id: original.id },
          data: { status: ReservationStatus.REPROGRAMADA },
        });

        return created;
      },
    );

    this.eventBus.publish(EVENT_TYPES.RESERVATION_RESCHEDULED, {
      originalReservationId: original.id,
      newReservationId: newReservation.id,
      clientId: original.clientId,
      newScheduledStart: newReservation.scheduledStart,
    });

    return newReservation;
  }
}
