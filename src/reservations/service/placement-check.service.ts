import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { getDayBoundaries } from '../domain/day-boundaries';
import { OperatingScheduleService } from './operating-schedule.service';
import {
  evaluatePlacement,
  type PlacementDecision,
} from '../domain/evaluate-placement';
import { personKey } from '../domain/person-key';

export interface PlacementCheckParams {
  clientId: string;
  dependentId: string | null;
  categoryId: string;
  treatmentId: string;
  start: Date;
  end: Date;
  excludeReservationId?: string;
  now?: Date;
}

@Injectable()
export class PlacementCheckService {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly operatingSchedule: OperatingScheduleService,
  ) {}

  async evaluate(
    tx: Prisma.TransactionClient,
    params: PlacementCheckParams,
  ): Promise<PlacementDecision> {
    const {
      clientId,
      dependentId,
      categoryId,
      treatmentId,
      start,
      end,
      excludeReservationId,
    } = params;
    const now = params.now ?? new Date();
    const { dayStart, dayEnd } = getDayBoundaries(start);

    const capacity = await this.availabilityRepository.getCapacityForCategory(
      categoryId,
      tx,
    );
    const held =
      await this.availabilityRepository.findHoldingIntervalsOverlapping(
        categoryId,
        start,
        end,
        tx,
        excludeReservationId,
      );
    const sameTreatmentStarts =
      await this.reservationsRepository.findActiveStartsForPersonTreatment(
        {
          clientId,
          dependentId,
          treatmentId,
          dayStart,
          dayEnd,
          excludeReservationId,
        },
        tx,
      );
    const person = personKey(clientId, dependentId);

    const operatingWindows = await this.operatingSchedule.getWindows(
      start,
      categoryId,
      tx,
    );

    return evaluatePlacement({
      start,
      end,
      now,
      operatingWindows,
      held: held.filter((interval) => interval.personKey !== person),
      capacity,
      hasDuplicateBooking: sameTreatmentStarts.some(
        (taken) => taken.getTime() === start.getTime(),
      ),
    });
  }
}
