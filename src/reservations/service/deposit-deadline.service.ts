import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import { getDayBoundaries } from '../domain/day-boundaries';
import { computeDepositExpiry } from '../domain/deposit-expiry';
import {
  getOperatingWindowsForDate,
  type DayException,
} from '../domain/operating-hours';
import { DEPOSIT_OPERATING_WINDOW_MS } from '../domain/reservation-timing.constants';
import { OperatingScheduleRepository } from '../repositories/operating-schedule.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

const BASE_CHANGE_LOOKAHEAD_MS = 365 * 24 * 60 * 60 * 1000;

export interface ExtendedDepositDeadline {
  reservationId: string;
  depositExpiresAt: Date;
}

@Injectable()
export class DepositDeadlineService {
  private readonly logger = new Logger(DepositDeadlineService.name);

  constructor(
    private readonly scheduleRepository: OperatingScheduleRepository,
    private readonly reservationsRepository: ReservationsRepository,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
  ) {}

  async computeExpiry(
    startedAt: Date,
    notAfter: Date,
    client?: PrismaClientOrTx,
  ): Promise<Date> {
    const [base, exceptions] = await Promise.all([
      this.scheduleRepository.findWeeklyWindows(client),
      this.scheduleRepository.findGlobalExceptionsBetween(
        getCalendarDayKey(startedAt),
        getCalendarDayKey(notAfter),
        client,
      ),
    ]);

    const byDay = new Map<string, DayException[]>();
    for (const { dayKey, ...exception } of exceptions) {
      byDay.set(dayKey, [...(byDay.get(dayKey) ?? []), exception]);
    }

    return computeDepositExpiry({
      startedAt,
      operatingMs: DEPOSIT_OPERATING_WINDOW_MS,
      notAfter,
      windowsForDay: (day) =>
        getOperatingWindowsForDate(day, {
          base,
          exceptions: byDay.get(getCalendarDayKey(day)) ?? [],
        }),
    });
  }

  async extendForScheduleChange(
    date: Date,
    client: PrismaClientOrTx,
  ): Promise<ExtendedDepositDeadline[]> {
    const { dayStart, dayEnd } = getDayBoundaries(date);
    return this.extendRunningDuring({ from: dayStart, until: dayEnd }, client);
  }

  async extendForBaseScheduleChange(
    now: Date,
    client: PrismaClientOrTx,
  ): Promise<ExtendedDepositDeadline[]> {
    return this.extendRunningDuring(
      { from: now, until: new Date(now.getTime() + BASE_CHANGE_LOOKAHEAD_MS) },
      client,
    );
  }

  private async extendRunningDuring(
    range: { from: Date; until: Date },
    client: PrismaClientOrTx,
  ): Promise<ExtendedDepositDeadline[]> {
    const running =
      await this.reservationsRepository.findDepositDeadlinesRunningDuring(
        range,
        client,
      );

    const extended: ExtendedDepositDeadline[] = [];
    for (const reservation of running) {
      const current = reservation.depositExpiresAt!;
      const recomputed = await this.computeExpiry(
        reservation.depositClockStartedAt!,
        reservation.scheduledStart,
        client,
      );
      if (recomputed.getTime() <= current.getTime()) continue;

      const applied =
        await this.reservationsRepository.extendDepositDeadlineIfUnchanged(
          reservation.id,
          current,
          recomputed,
          client,
        );
      if (applied) {
        extended.push({
          reservationId: reservation.id,
          depositExpiresAt: recomputed,
        });
      }
    }
    return extended;
  }

  async scheduleTimeout(reservationId: string, expiresAt: Date): Promise<void> {
    try {
      await this.timeoutsQueue.add(
        JOB_NAMES.DEPOSITO_TIMEOUT,
        { reservationId },
        { delay: Math.max(expiresAt.getTime() - Date.now(), 0) },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar deposito-timeout de ${reservationId}; lo cubrirá el barrido: ${message}`,
      );
    }
  }
}
