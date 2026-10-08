import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScheduleExceptionType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import { AvailabilityRepository } from '../../reservations/repositories/availability.repository';
import {
  OperatingScheduleRepository,
  fromScheduleDate,
} from '../../reservations/repositories/operating-schedule.repository';
import { OperatingScheduleService } from '../../reservations/service/operating-schedule.service';
import { availabilityCacheKey } from '../../reservations/reservations.service';
import { getCalendarDayKey } from '../../reservations/domain/calendar-day-key';
import { getDayBoundaries } from '../../reservations/domain/day-boundaries';
import {
  findIntervalsOutsideWindows,
  getOperatingWindowsForDate,
  type DaySchedule,
  type TimeWindow,
} from '../../reservations/domain/operating-hours';
import {
  formatTimeOfDay,
  parseTimeOfDay,
} from '../../reservations/domain/schedule-time';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { FindScheduleExceptionsQueryDto } from './dto/find-schedule-exceptions-query.dto';

interface ExceptionRecord {
  id: string;
  date: Date;
  type: ScheduleExceptionType;
  categoryId: string | null;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  createdAt: Date;
  category?: { id: string; name: string } | null;
}

@Injectable()
export class AdminScheduleService {
  private readonly logger = new Logger(AdminScheduleService.name);

  constructor(
    private readonly repository: OperatingScheduleRepository,
    private readonly operatingSchedule: OperatingScheduleService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly cache: SafeCacheService,
  ) {}

  async getBaseSchedule() {
    const windows = await this.repository.findWeeklyWindows();
    return windows.map((w) => ({
      dayOfWeek: w.dayOfWeek,
      startTime: formatTimeOfDay(w.startMinute),
      endTime: formatTimeOfDay(w.endMinute),
    }));
  }

  async listExceptions(query: FindScheduleExceptionsQueryDto) {
    this.assertValidDayKey(query.from);
    this.assertValidDayKey(query.to);
    const rows = await this.repository.findExceptionsInRange({
      fromDayKey: query.from,
      toDayKey: query.to,
      categoryId: query.categoryId,
    });
    return rows.map((row) => this.toExceptionView(row));
  }

  async getDay(dayKey: string) {
    const date = this.assertValidDayKey(dayKey);
    const [schedule, categories, exceptions] = await Promise.all([
      this.operatingSchedule.loadDaySchedule(date),
      this.repository.findCategories(),
      this.repository.findExceptionsInRange({
        fromDayKey: dayKey,
        toDayKey: dayKey,
      }),
    ]);
    const global = getOperatingWindowsForDate(date, schedule);
    const { dayStart } = getDayBoundaries(date);

    return {
      date: dayKey,
      isClosed: global.length === 0,
      windows: global.map((w) => this.toWindowView(w, dayStart)),
      categories: categories.map((category) => {
        const windows = getOperatingWindowsForDate(date, schedule, category.id);
        return {
          categoryId: category.id,
          name: category.name,
          isClosed: windows.length === 0,
          windows: windows.map((w) => this.toWindowView(w, dayStart)),
        };
      }),
      exceptions: exceptions.map((row) => this.toExceptionView(row)),
    };
  }

  async createException(dto: CreateScheduleExceptionDto, adminUserId: string) {
    const date = this.assertValidDayKey(dto.date);
    this.assertNotPast(dto.date);
    const { startMinute, endMinute } = this.resolveRange(dto);
    if (
      dto.categoryId &&
      !(await this.repository.categoryExists(dto.categoryId))
    ) {
      throw new NotFoundException('Categoría no encontrada');
    }

    const affected = dto.categoryId
      ? [dto.categoryId]
      : await this.repository.findCategoryIds();

    const created = await this.availabilityRepository.withCategoriesLock(
      affected,
      date,
      async (tx) => {
        const current = await this.operatingSchedule.loadDaySchedule(date, tx);
        const proposed: DaySchedule = {
          base: current.base,
          exceptions: [
            ...current.exceptions,
            {
              type: dto.type,
              categoryId: dto.categoryId ?? null,
              startMinute,
              endMinute,
            },
          ],
        };
        await this.assertNoDisplacedReservations(
          date,
          affected,
          current,
          proposed,
          tx,
        );
        return this.repository.createException(
          {
            dayKey: dto.date,
            type: dto.type,
            categoryId: dto.categoryId ?? null,
            startMinute,
            endMinute,
            reason: dto.reason ?? null,
            createdByUserId: adminUserId,
          },
          tx,
        );
      },
    );

    await this.invalidateAvailability(affected, dto.date);
    return this.toExceptionView(created);
  }

  async deleteException(id: string) {
    const existing = await this.repository.findExceptionById(id);
    if (!existing)
      throw new NotFoundException('Excepción de horario no encontrada');

    const dayKey = fromScheduleDate(existing.date);
    this.assertNotPast(dayKey);
    const date = this.assertValidDayKey(dayKey);
    const affected = existing.categoryId
      ? [existing.categoryId]
      : await this.repository.findCategoryIds();

    await this.availabilityRepository.withCategoriesLock(
      affected,
      date,
      async (tx) => {
        const current = await this.operatingSchedule.loadDaySchedule(date, tx);
        const proposed: DaySchedule = {
          base: current.base,
          exceptions: current.exceptions.filter((e) => e.id !== id),
        };
        await this.assertNoDisplacedReservations(
          date,
          affected,
          current,
          proposed,
          tx,
        );
        await this.repository.deleteException(id, tx);
      },
    );

    await this.invalidateAvailability(affected, dayKey);
    return this.toExceptionView(existing);
  }

  private async assertNoDisplacedReservations(
    date: Date,
    categoryIds: readonly string[],
    current: DaySchedule,
    proposed: DaySchedule,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { dayStart, dayEnd } = getDayBoundaries(date);
    const reservations = await this.repository.findLiveReservationsOnDay(
      { dayStart, dayEnd, categoryIds },
      tx,
    );

    const displaced = categoryIds.flatMap((categoryId) => {
      const own = reservations.filter((r) => r.categoryId === categoryId);
      const outsideNow = new Set(
        findIntervalsOutsideWindows(
          own,
          getOperatingWindowsForDate(date, current, categoryId),
        ).map((r) => r.id),
      );
      return findIntervalsOutsideWindows(
        own,
        getOperatingWindowsForDate(date, proposed, categoryId),
      ).filter((r) => !outsideNow.has(r.id));
    });

    if (displaced.length === 0) return;

    throw new AppException('SCHEDULE_CHANGE_HAS_RESERVATIONS', {
      message: `Hay ${displaced.length} reserva(s) dentro del horario que quieres cerrar el ${getCalendarDayKey(date)}. Reprográmalas o cancélalas y vuelve a intentarlo.`,
      details: {
        date: getCalendarDayKey(date),
        resolution: ['RESCHEDULE', 'CANCEL'],
        reservations: displaced.map((r) => ({
          reservationId: r.id,
          status: r.status,
          clientId: r.client.id,
          clientName: r.client.name,
          clientPhone: r.client.phone,
          treatment: r.treatment.name,
          category: r.category.name,
          scheduledStart: r.scheduledStart,
          scheduledEnd: r.scheduledEnd,
        })),
      },
    });
  }

  private async invalidateAvailability(
    categoryIds: readonly string[],
    dayKey: string,
  ): Promise<void> {
    const treatmentIds =
      await this.repository.findTreatmentIdsForCategories(categoryIds);
    await Promise.all(
      treatmentIds.map((treatmentId) =>
        this.cache.delete(availabilityCacheKey(treatmentId, dayKey)),
      ),
    );
    this.logger.log(
      `Disponibilidad invalidada para ${treatmentIds.length} tratamiento(s) el ${dayKey}`,
    );
  }

  private resolveRange(dto: CreateScheduleExceptionDto): {
    startMinute: number | null;
    endMinute: number | null;
  } {
    const hasStart = dto.startTime !== undefined;
    const hasEnd = dto.endTime !== undefined;

    if (!hasStart && !hasEnd) {
      if (dto.type === ScheduleExceptionType.OPEN) {
        throw new AppException('SCHEDULE_EXCEPTION_INVALID_RANGE', {
          message: 'Para abrir horario extra indica la hora de inicio y fin.',
        });
      }
      return { startMinute: null, endMinute: null };
    }

    const startMinute = hasStart ? parseTimeOfDay(dto.startTime!) : null;
    const endMinute = hasEnd ? parseTimeOfDay(dto.endTime!) : null;
    if (
      startMinute === null ||
      endMinute === null ||
      startMinute >= endMinute
    ) {
      throw new AppException('SCHEDULE_EXCEPTION_INVALID_RANGE');
    }
    return { startMinute, endMinute };
  }

  private assertValidDayKey(dayKey: string): Date {
    const date = new Date(`${dayKey}T00:00:00`);
    if (Number.isNaN(date.getTime()) || getCalendarDayKey(date) !== dayKey) {
      throw new AppException('BAD_REQUEST', {
        message: `La fecha ${dayKey} no es válida.`,
      });
    }
    return date;
  }

  private assertNotPast(dayKey: string): void {
    if (dayKey < getCalendarDayKey(new Date())) {
      throw new AppException('SCHEDULE_EXCEPTION_IN_THE_PAST', {
        details: { date: dayKey },
      });
    }
  }

  private toWindowView(window: TimeWindow, dayStart: Date) {
    const minutesFromDayStart = (moment: Date) =>
      Math.round((moment.getTime() - dayStart.getTime()) / 60_000);
    return {
      start: window.start,
      end: window.end,
      startTime: formatTimeOfDay(minutesFromDayStart(window.start)),
      endTime: formatTimeOfDay(minutesFromDayStart(window.end)),
    };
  }

  private toExceptionView(row: ExceptionRecord) {
    const allDay = row.startMinute === null || row.endMinute === null;
    return {
      id: row.id,
      date: fromScheduleDate(row.date),
      type: row.type,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      scope: row.categoryId ? 'CATEGORY' : 'GLOBAL',
      allDay,
      startTime: allDay ? null : formatTimeOfDay(row.startMinute!),
      endTime: allDay ? null : formatTimeOfDay(row.endMinute!),
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }
}
