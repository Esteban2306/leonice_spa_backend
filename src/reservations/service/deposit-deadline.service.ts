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
import { enqueueWithin } from '../../infrastructure/queue/enqueue-within';
import { NOTICE_JOB_OPTIONS } from '../../automation/domain/operational-notifications.constants';
import { ReservationsRepository } from '../repositories/reservations.repository';
import {
  depositReminderAt,
  depositReminderJobId,
} from '../domain/deposit-reminder';

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
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly communicationsQueue: Queue,
  ) {}

  async computeExpiry(
    startedAt: Date,
    notAfter: Date,
    client?: PrismaClientOrTx,
  ): Promise<Date> {
    const fromDayKey = getCalendarDayKey(startedAt);
    const toDayKey = getCalendarDayKey(notAfter);
    const [base, exceptions, overrides] = await Promise.all([
      this.scheduleRepository.findWeeklyWindows(client),
      this.scheduleRepository.findGlobalExceptionsBetween(
        fromDayKey,
        toDayKey,
        client,
      ),
      this.scheduleRepository.findOverridesBetween(
        fromDayKey,
        toDayKey,
        client,
      ),
    ]);
    const overrideByDay = new Map(
      overrides.map((override) => [override.dayKey, override]),
    );

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
          override: overrideByDay.get(getCalendarDayKey(day)) ?? null,
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
    const lateFailure = (error: unknown) =>
      this.logger.error(
        `deposito-timeout de ${reservationId} no se encoló al volver Redis; lo cubrirá el barrido: ${error instanceof Error ? error.message : String(error)}`,
      );
    try {
      const outcome = await enqueueWithin(
        this.timeoutsQueue.add(
          JOB_NAMES.DEPOSITO_TIMEOUT,
          { reservationId },
          { delay: Math.max(expiresAt.getTime() - Date.now(), 0) },
        ),
        lateFailure,
      );
      if (outcome === 'DEFERRED') {
        this.logger.warn(
          `Redis no respondió a tiempo: deposito-timeout de ${reservationId} se encolará al reconectar y el barrido lo cubre si no`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar deposito-timeout de ${reservationId}; lo cubrirá el barrido: ${message}`,
      );
    }
    await this.scheduleReminder(reservationId, expiresAt);
  }

  private async scheduleReminder(
    reservationId: string,
    expiresAt: Date,
  ): Promise<void> {
    const at = depositReminderAt(expiresAt, new Date());
    if (!at) return;
    const lateFailure = (error: unknown) =>
      this.logger.warn(
        `El recordatorio de anticipo de ${reservationId} no se encoló al volver Redis: ${error instanceof Error ? error.message : String(error)}`,
      );
    try {
      await enqueueWithin(
        this.communicationsQueue.add(
          JOB_NAMES.SEND_CLIENT_DEPOSIT_REMINDER,
          { reservationId, expiresAt: expiresAt.toISOString() },
          {
            ...NOTICE_JOB_OPTIONS,
            delay: Math.max(at.getTime() - Date.now(), 0),
            jobId: depositReminderJobId(reservationId, expiresAt),
          },
        ),
        lateFailure,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo encolar el recordatorio de anticipo de ${reservationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
