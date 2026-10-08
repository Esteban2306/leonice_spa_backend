import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import {
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
    const [base, exceptions] = await Promise.all([
      this.repository.findWeeklyWindows(client),
      this.repository.findDayExceptions(getCalendarDayKey(date), client),
    ]);
    return { base, exceptions };
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
