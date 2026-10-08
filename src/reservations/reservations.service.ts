import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AvailabilityRepository } from './repositories/availability.repository';
import { OperatingScheduleService } from './service/operating-schedule.service';
import { generateAvailableSlots } from './domain/availability-calculator';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { ReservationsRepository } from './repositories/reservations.repository';
import { formatLocalTime } from './domain/format-local-time';
import { FindReservationsQueryDto } from './dto/find-reservations-query.dto';
import { resolveCalendarRange } from './domain/calendar-range';
import {
  groupReservationsForDisplay,
  paginateReservationGroups,
} from './domain/group-reservations-for-display';

const AVAILABILITY_CACHE_TTL_SECONDS = 10;

export function availabilityCacheKey(treatmentId: string, dayKey: string) {
  return `availability:${treatmentId}:${dayKey}`;
}

export interface AvailabilitySlot {
  iso: string;
  localTime: string;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly cache: SafeCacheService,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly operatingSchedule: OperatingScheduleService,
  ) {}

  async getAvailability(
    treatmentId: string,
    dateStr: string,
  ): Promise<AvailabilitySlot[]> {
    const cacheKey = availabilityCacheKey(treatmentId, dateStr);

    const cached = await this.cache.get<AvailabilitySlot[]>(cacheKey);
    if (cached) return cached;

    const slots = await this.computeAvailability(treatmentId, dateStr);
    const shaped: AvailabilitySlot[] = slots.map((s) => ({
      iso: s.toISOString(),
      localTime: formatLocalTime(s),
    }));

    void this.cache.set(cacheKey, shaped, AVAILABILITY_CACHE_TTL_SECONDS);
    return shaped;
  }

  async getById(id: string) {
    const reservation =
      await this.reservationsRepository.findByIdWithDetails(id);

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada');
    }

    return reservation;
  }

  async findMany(query: FindReservationsQueryDto) {
    const range = resolveCalendarRange(query);

    const rows = await this.reservationsRepository.findGroupingProjection({
      dayStart: range.dayStart,
      dayEnd: range.dayEnd,
      status: query.status,
      cancellationSources: query.cancellationSources,
      categoryId: query.categoryId,
      clientId: query.clientId,
    });

    const groupsPage = paginateReservationGroups(
      rows,
      { page: query.page, pageSize: query.pageSize },
      { onlyUnresolvedDeposit: query.hasUnresolvedDeposit === true },
    );

    const reservations =
      await this.reservationsRepository.findManyByIdsWithDetails(
        groupsPage.reservationIds,
      );

    return {
      data: groupReservationsForDisplay(reservations),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: groupsPage.total,
        totalPages: groupsPage.totalPages,
      },
    };
  }

  private async computeAvailability(
    treatmentId: string,
    dateStr: string,
  ): Promise<Date[]> {
    const treatment = await this.prisma.client.treatment.findFirst({
      where: { id: treatmentId },
    });

    if (!treatment || !treatment.isActive) {
      throw new NotFoundException('Tratamiento no encontrado');
    }

    const durationMinutes =
      treatment?.baseDurationMaxMinutes ??
      treatment?.baseDurationMinMinutes ??
      60;

    const date = new Date(`${dateStr}T00:00:00`);

    const operatingWindows = await this.operatingSchedule.getWindows(
      date,
      treatment.categoryId,
    );
    if (operatingWindows.length === 0) return [];

    const dayStart = operatingWindows[0].start;
    const dayEnd = operatingWindows[operatingWindows.length - 1].end;

    const [held, capacity] = await Promise.all([
      this.availabilityRepository.getHoldingReservationsInRange(
        treatment.categoryId,
        dayStart,
        dayEnd,
      ),
      this.availabilityRepository.getCapacityForCategory(treatment.categoryId),
    ]);

    return generateAvailableSlots({
      operatingWindows,
      held,
      durationMinutes,
      capacity,
    });
  }
}
