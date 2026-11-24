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

export interface PlacementCheckParams {
  clientId: string;
  /** undefined: any person of the client; null: the client herself; id: that dependent. */
  dependentId?: string | null;
  categoryId: string;
  start: Date;
  end: Date;
  excludeReservationId?: string;
  comboGroupId?: string | null;
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
        params.comboGroupId ?? undefined,
        params.dependentId,
      );
    const hasCategoryDayConflict =
      await this.reservationsRepository.hasActiveReservationInCategoryOnDay(
        clientId,
        categoryId,
        dayStart,
        dayEnd,
        excludeReservationId,
        tx,
        params.dependentId,
      );

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
      held,
      capacity,
      clientIntervals,
      hasCategoryDayConflict,
    });
  }
}
