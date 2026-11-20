import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import {
  fixedStartMinutes,
  getOperatingWindowsForDate,
  type DayException,
  type DaySchedule,
  type TimeWindow,
} from '../domain/operating-hours';
import { OperatingScheduleRepository } from '../repositories/operating-schedule.repository';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export interface LoadedDaySchedule extends DaySchedule {
  exceptions: Array<DayException & { id: string }>;
}

@Injectable()
export class OperatingScheduleService {
  constructor(private readonly repository: OperatingScheduleRepository) {}

  async loadDaySchedule(
    date: Date,
    client?: PrismaClientOrTx,
  ): Promise<LoadedDaySchedule> {
    const dayKey = getCalendarDayKey(date);
    const [base, exceptions, override] = await Promise.all([
      this.repository.findWeeklyWindows(client),
      this.repository.findDayExceptions(dayKey, client),
      this.repository.findDayOverride(dayKey, client),
    ]);
    return {
      base,
      exceptions,
      override: override
        ? { windows: override.windows, startMinutes: override.startMinutes }
        : null,
    };
  }

  async getDayPlan(
    date: Date,
    categoryId?: string,
    client?: PrismaClientOrTx,
  ): Promise<{ windows: TimeWindow[]; startMinutes: number[] | null }> {
    const schedule = await this.loadDaySchedule(date, client);
    return {
      windows: getOperatingWindowsForDate(date, schedule, categoryId),
      startMinutes: fixedStartMinutes(schedule),
    };
  }

  async getWindows(
    date: Date,
    categoryId?: string,
    client?: PrismaClientOrTx,
  ): Promise<TimeWindow[]> {
    const schedule = await this.loadDaySchedule(date, client);
    return getOperatingWindowsForDate(date, schedule, categoryId);
  }
}
