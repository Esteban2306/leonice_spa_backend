import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Reservation, ReservationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { NO_SHOW_GRACE_MS } from '../domain/reservation-timing.constants';
import { placementRejectionException } from '../domain/placement-rejection.exception';
import { PlacementCheckService } from './placement-check.service';

export const RESCHEDULABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
];

export const RESCHEDULE_ERROR_CODES = {
  NOT_RESCHEDULABLE: 'RESERVATION_NOT_RESCHEDULABLE',
  SAME_SLOT: 'RESERVATION_RESCHEDULE_SAME_SLOT',
  CONCURRENT_CHANGE: 'RESERVATION_RESCHEDULE_CONCURRENT_CHANGE',
} as const;

export interface RescheduleInPlaceResult {
  reservation: Reservation;
  previousScheduledStart: Date;
}

@Injectable()
export class ReservationRescheduler {
  private readonly logger = new Logger(ReservationRescheduler.name);

  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly placementCheck: PlacementCheckService,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
  ) {}

  async execute(
    reservationId: string,
    newScheduledStart: Date,
  ): Promise<RescheduleInPlaceResult> {
    const initial = await this.reservationsRepository.findById(reservationId);
    if (!initial) throw new NotFoundException('Reserva no encontrada');
    this.assertReschedulable(initial, initial.status);

    const outcome = await this.availabilityRepository.withCategoryLock(
      initial.categoryId,
      newScheduledStart,
      async (tx) => {
        const current = await this.reservationsRepository.findById(
          reservationId,
          tx,
        );
        if (!current) throw new NotFoundException('Reserva no encontrada');
        this.assertReschedulable(current, current.status);

        if (current.scheduledStart.getTime() === newScheduledStart.getTime()) {
          throw new DomainException({
            code: RESCHEDULE_ERROR_CODES.SAME_SLOT,
            message: 'La reserva ya está en ese horario.',
          });
        }

        const newScheduledEnd = new Date(
          newScheduledStart.getTime() + current.finalDurationMinutes * 60_000,
        );

        const decision = await this.placementCheck.evaluate(tx, {
          clientId: current.clientId,
          categoryId: current.categoryId,
          start: newScheduledStart,
          end: newScheduledEnd,
          excludeReservationId: current.id,
        });
        if (!decision.ok) throw placementRejectionException(decision.reason);

        const applied =
          await this.reservationsRepository.updateScheduleIfCurrent(
            current.id,
            { status: current.status, scheduledStart: current.scheduledStart },
            {
              scheduledStart: newScheduledStart,
              scheduledEnd: newScheduledEnd,
            },
            tx,
          );
        if (!applied) {
          throw new DomainException({
            code: RESCHEDULE_ERROR_CODES.CONCURRENT_CHANGE,
            message:
              'La reserva cambió mientras se reagendaba. Revisa su estado actual.',
          });
        }

        const updated = await this.reservationsRepository.findById(
          current.id,
          tx,
        );
        if (!updated) throw new NotFoundException('Reserva no encontrada');

        return {
          reservation: updated,
          previousScheduledStart: current.scheduledStart,
        };
      },
    );

    if (outcome.reservation.status === ReservationStatus.CONFIRMADA) {
      await this.scheduleNoShowCheck(
        outcome.reservation.id,
        outcome.reservation.scheduledStart,
      );
    }

    return outcome;
  }

  private assertReschedulable(
    reservation: Pick<Reservation, 'id'>,
    status: ReservationStatus,
  ): void {
    if (!RESCHEDULABLE_STATUSES.includes(status)) {
      throw new DomainException({
        code: RESCHEDULE_ERROR_CODES.NOT_RESCHEDULABLE,
        message: `Solo se pueden reagendar reservas pendientes de depósito o confirmadas (estado actual: ${status}).`,
        reservationId: reservation.id,
      });
    }
  }

  private async scheduleNoShowCheck(
    reservationId: string,
    scheduledStart: Date,
  ): Promise<void> {
    try {
      const delay = Math.max(
        scheduledStart.getTime() + NO_SHOW_GRACE_MS - Date.now(),
        0,
      );
      await this.timeoutsQueue.add(
        JOB_NAMES.NO_SHOW_CHECK,
        { reservationId },
        { delay },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo reprogramar no-show-check de ${reservationId}; NO hay barrido que lo cubra: ${message}`,
      );
    }
  }
}
