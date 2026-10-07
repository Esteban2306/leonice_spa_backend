import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { getDayBoundaries } from '../domain/day-boundaries';
import { getOperatingWindowsForDate } from '../domain/operating-hours';
import {
  evaluatePlacement,
  type PlacementDecision,
} from '../domain/evaluate-placement';

export interface PlacementCheckParams {
  clientId: string;
  categoryId: string;
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
  ) {}

  async evaluate(
    tx: Prisma.TransactionClient,
    params: PlacementCheckParams,
  ): Promise<PlacementDecision> {
    const { clientId, categoryId, start, end, excludeReservationId } = params;
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
    const clientIntervals =
      await this.reservationsRepository.findActiveIntervalsForClientOnDay(
        clientId,
        dayStart,
        dayEnd,
        tx,
        excludeReservationId,
      );
    const hasCategoryDayConflict =
      await this.reservationsRepository.hasActiveReservationInCategoryOnDay(
        clientId,
        categoryId,
        dayStart,
        dayEnd,
        excludeReservationId,
        tx,
      );

    return evaluatePlacement({
      start,
      end,
      now,
      operatingWindows: getOperatingWindowsForDate(start),
      held,
      capacity,
      clientIntervals,
      hasCategoryDayConflict,
    });
  }
}
