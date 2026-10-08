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
import { getDayBoundaries } from './domain/day-boundaries';
import { getCalendarDayKey } from './domain/calendar-day-key';
import {
  findComboStarts,
  orderComboSegments,
} from './domain/combo-availability';
import {
  MAX_ADVANCE_DAYS,
  MIN_ADVANCE_DAYS,
} from './domain/reservation-timing.constants';
import { GetAvailabilityCalendarDto } from './dto/get-availability-calendar.dto';
import {
  groupReservationsForDisplay,
  paginateReservationGroups,
} from './domain/group-reservations-for-display';

const AVAILABILITY_CACHE_TTL_SECONDS = 10;

export function availabilityCacheKey(treatmentId: string, dayKey: string) {
  return `availability:${treatmentId}:${dayKey}`;
}

export type AvailabilityDayReason =
  'OUT_OF_RANGE' | 'TOO_SOON' | 'CLOSED' | 'FULL';

export interface AvailabilityDay {
  date: string;
  available: boolean;
  reason: AvailabilityDayReason | null;
  slots: AvailabilitySlot[];
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

  async getAvailabilityCalendar(
    query: GetAvailabilityCalendarDto,
    now: Date = new Date(),
  ): Promise<{ treatmentIds: string[]; days: AvailabilityDay[] }> {
    const { dayStart, dayEnd } = resolveCalendarRange(
      { from: query.from, to: query.to },
      62,
    );

    const treatments = await this.prisma.client.treatment.findMany({
      where: { id: { in: query.treatmentIds }, isActive: true },
      include: { category: { select: { isPrincipal: true } } },
    });
    if (treatments.length !== new Set(query.treatmentIds).size) {
      throw new NotFoundException(
        'Uno o más tratamientos no existen o no están activos',
      );
    }

    const ordered = orderComboSegments(
      treatments.map((t) => ({
        id: t.id,
        isPrincipal: t.category.isPrincipal,
        durationMinutes:
          t.baseDurationMaxMinutes ?? t.baseDurationMinMinutes ?? 60,
      })),
    );

    const earliest =
      query.purpose === 'RESCHEDULE'
        ? now
        : new Date(now.getTime() + MIN_ADVANCE_DAYS * 24 * 60 * 60 * 1000);
    const latest = new Date(
      now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000,
    );

    const dayStarts: Date[] = [];
    for (
      let day = dayStart!;
      day.getTime() < dayEnd!.getTime();
      day = getDayBoundaries(day).dayEnd
    ) {
      dayStarts.push(day);
    }

    const days = await Promise.all(
      dayStarts.map((day) =>
        this.resolveAvailabilityDay(day, ordered, earliest, latest),
      ),
    );

    return { treatmentIds: ordered.map((t) => t.id), days };
  }

  private async resolveAvailabilityDay(
    day: Date,
    ordered: ReadonlyArray<{ id: string; durationMinutes: number }>,
    earliest: Date,
    latest: Date,
  ): Promise<AvailabilityDay> {
    const date = getCalendarDayKey(day);
    const unavailable = (reason: AvailabilityDayReason): AvailabilityDay => ({
      date,
      available: false,
      reason,
      slots: [],
    });

    if (getDayBoundaries(day).dayEnd.getTime() <= earliest.getTime()) {
      return unavailable('TOO_SOON');
    }
    if (day.getTime() > latest.getTime()) return unavailable('OUT_OF_RANGE');

    const perTreatment = await Promise.all(
      ordered.map((t) => this.getAvailability(t.id, date)),
    );
    if (perTreatment[0].length === 0) {
      const windows = await this.operatingSchedule.getWindows(day);
      return unavailable(windows.length === 0 ? 'CLOSED' : 'FULL');
    }

    const starts = findComboStarts(
      ordered.map((t, index) => ({
        durationMinutes: t.durationMinutes,
        slotIsos: perTreatment[index].map((slot) => slot.iso),
      })),
      earliest,
    );
    const byIso = new Map(perTreatment[0].map((slot) => [slot.iso, slot]));
    const slots = starts.map((iso) => byIso.get(iso)!);

    if (slots.length > 0) return { date, available: true, reason: null, slots };

    const anyAfterEarliest = perTreatment[0].some(
      (slot) => new Date(slot.iso).getTime() >= earliest.getTime(),
    );
    return unavailable(anyAfterEarliest ? 'FULL' : 'TOO_SOON');
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
