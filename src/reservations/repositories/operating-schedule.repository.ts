import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  ReservationStatus,
  ScheduleExceptionType,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { DayException, WeeklyWindow } from '../domain/operating-hours';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export const LIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
  ReservationStatus.CITA_EN_CURSO,
];

const BASE_SCHEDULE_LOCK_KEY = 'operating-schedule:base';

export function toScheduleDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function fromScheduleDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface CreateScheduleExceptionData {
  dayKey: string;
  type: ScheduleExceptionType;
  categoryId: string | null;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  createdByUserId: string;
}

@Injectable()
export class OperatingScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findWeeklyWindows(
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<WeeklyWindow[]> {
    return client.operatingWindow.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    });
  }

  async findDayExceptions(
    dayKey: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<Array<DayException & { id: string }>> {
    return client.scheduleException.findMany({
      where: { date: toScheduleDate(dayKey) },
      select: {
        id: true,
        type: true,
        categoryId: true,
        startMinute: true,
        endMinute: true,
      },
    });
  }

  async findGlobalExceptionsBetween(
    fromDayKey: string,
    toDayKey: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<Array<DayException & { dayKey: string }>> {
    const rows = await client.scheduleException.findMany({
      where: {
        categoryId: null,
        date: {
          gte: toScheduleDate(fromDayKey),
          lte: toScheduleDate(toDayKey),
        },
      },
      select: {
        date: true,
        type: true,
        categoryId: true,
        startMinute: true,
        endMinute: true,
      },
    });
    return rows.map(({ date, ...exception }) => ({
      ...exception,
      dayKey: fromScheduleDate(date),
    }));
  }

  findExceptionsInRange(params: {
    fromDayKey: string;
    toDayKey: string;
    categoryId?: string;
  }) {
    return this.prisma.client.scheduleException.findMany({
      where: {
        date: {
          gte: toScheduleDate(params.fromDayKey),
          lte: toScheduleDate(params.toDayKey),
        },
        ...(params.categoryId
          ? { OR: [{ categoryId: null }, { categoryId: params.categoryId }] }
          : {}),
      },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    });
  }

  findExceptionById(id: string, client: PrismaClientOrTx = this.prisma.client) {
    return client.scheduleException.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  findCategories(client: PrismaClientOrTx = this.prisma.client) {
    return client.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  createException(
    data: CreateScheduleExceptionData,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.scheduleException.create({
      data: {
        date: toScheduleDate(data.dayKey),
        type: data.type,
        categoryId: data.categoryId,
        startMinute: data.startMinute,
        endMinute: data.endMinute,
        reason: data.reason,
        createdByUserId: data.createdByUserId,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  deleteException(id: string, client: PrismaClientOrTx = this.prisma.client) {
    return client.scheduleException.delete({ where: { id } });
  }

  findCategoryIds(client: PrismaClientOrTx = this.prisma.client) {
    return client.category
      .findMany({ select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
  }

  categoryExists(id: string, client: PrismaClientOrTx = this.prisma.client) {
    return client.category.count({ where: { id } }).then((count) => count > 0);
  }

  findTreatmentIdsForCategories(categoryIds: readonly string[]) {
    return this.prisma.client.treatment
      .findMany({
        where: { categoryId: { in: [...categoryIds] } },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));
  }

  withBaseScheduleLock<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BASE_SCHEDULE_LOCK_KEY}))`;
      return fn(tx);
    });
  }

  async replaceWeeklyWindows(
    windows: readonly WeeklyWindow[],
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.operatingWindow.deleteMany({});
    await client.operatingWindow.createMany({ data: [...windows] });
  }

  findLiveReservationsFrom(
    from: Date,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        status: { in: [...LIVE_RESERVATION_STATUSES] },
        scheduledEnd: { gt: from },
      },
      orderBy: { scheduledStart: 'asc' },
      select: {
        id: true,
        categoryId: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        client: { select: { id: true, name: true, phone: true } },
        treatment: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
  }

  findLiveReservationsOnDay(
    params: { dayStart: Date; dayEnd: Date; categoryIds: readonly string[] },
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        categoryId: { in: [...params.categoryIds] },
        status: { in: [...LIVE_RESERVATION_STATUSES] },
        scheduledStart: { gte: params.dayStart, lt: params.dayEnd },
      },
      orderBy: { scheduledStart: 'asc' },
      select: {
        id: true,
        categoryId: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        client: { select: { id: true, name: true, phone: true } },
        treatment: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
  }
}
