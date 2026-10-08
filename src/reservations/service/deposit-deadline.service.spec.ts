import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import {
  DEFAULT_WEEKLY_WINDOWS,
  type DayException,
} from '../domain/operating-hours';
import { OperatingScheduleRepository } from '../repositories/operating-schedule.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { DepositDeadlineService } from './deposit-deadline.service';

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute, 0, 0);

interface RunningDeadline {
  id: string;
  scheduledStart: Date;
  depositClockStartedAt: Date;
  depositExpiresAt: Date;
}

const buildFixture = (options: {
  exceptions?: Array<DayException & { dayKey: string }>;
  running?: RunningDeadline[];
  casFailsFor?: string[];
  queueError?: Error;
}) => {
  const updates: Array<{ id: string; previous: Date; next: Date }> = [];
  const enqueued: Array<{ name: string; delay: number | undefined }> = [];

  const scheduleRepository = {
    findWeeklyWindows: () => Promise.resolve(DEFAULT_WEEKLY_WINDOWS),
    findGlobalExceptionsBetween: () =>
      Promise.resolve(options.exceptions ?? []),
  };
  const reservationsRepository = {
    findDepositDeadlinesRunningDuring: () =>
      Promise.resolve(options.running ?? []),
    extendDepositDeadlineIfUnchanged: (
      id: string,
      previous: Date,
      next: Date,
    ) => {
      updates.push({ id, previous, next });
      return Promise.resolve(!(options.casFailsFor ?? []).includes(id));
    },
  };
  const queue = {
    add: (name: string, _data: unknown, opts?: { delay?: number }) => {
      enqueued.push({ name, delay: opts?.delay });
      return options.queueError
        ? Promise.reject(options.queueError)
        : Promise.resolve({});
    },
  };

  const service = new DepositDeadlineService(
    scheduleRepository as unknown as OperatingScheduleRepository,
    reservationsRepository as unknown as ReservationsRepository,
    queue as unknown as Queue,
  );
  return { service, updates, enqueued };
};

const tx = {} as Prisma.TransactionClient;

const fridayBlocked: DayException & { dayKey: string } = {
  dayKey: '2026-10-23',
  type: 'BLOCK',
  categoryId: null,
  startMinute: null,
  endMinute: null,
};

describe('DepositDeadlineService.computeExpiry', () => {
  it('aplica los bloqueos globales del rango al reloj hábil', async () => {
    const { service } = buildFixture({ exceptions: [fridayBlocked] });
    await expect(service.computeExpiry(at(22, 20), at(31, 9))).resolves.toEqual(
      at(24, 9),
    );
  });
});

describe('DepositDeadlineService.extendForScheduleChange', () => {
  const running = (id: string, depositExpiresAt: Date): RunningDeadline => ({
    id,
    scheduledStart: at(31, 9),
    depositClockStartedAt: at(22, 20),
    depositExpiresAt,
  });

  it('extiende el plazo cuando un bloqueo nuevo cae dentro del plazo en curso', async () => {
    const { service, updates } = buildFixture({
      exceptions: [fridayBlocked],
      running: [running('r1', at(23, 10))],
    });

    const extended = await service.extendForScheduleChange(at(23, 0), tx);

    expect(extended).toEqual([
      { reservationId: 'r1', depositExpiresAt: at(24, 9) },
    ]);
    expect(updates).toEqual([
      { id: 'r1', previous: at(23, 10), next: at(24, 9) },
    ]);
  });

  it('nunca acorta un plazo ya comunicado al cliente', async () => {
    const { service, updates } = buildFixture({
      running: [running('r1', at(24, 9))],
    });

    await expect(
      service.extendForScheduleChange(at(23, 0), tx),
    ).resolves.toEqual([]);
    expect(updates).toEqual([]);
  });

  it('omite la reserva si su plazo cambió en paralelo', async () => {
    const { service } = buildFixture({
      exceptions: [fridayBlocked],
      running: [running('r1', at(23, 10)), running('r2', at(23, 10))],
      casFailsFor: ['r1'],
    });

    const extended = await service.extendForScheduleChange(at(23, 0), tx);

    expect(extended.map((e) => e.reservationId)).toEqual(['r2']);
  });
});

describe('DepositDeadlineService.scheduleTimeout', () => {
  it('encola deposito-timeout con el retraso hasta el vencimiento', async () => {
    const { service, enqueued } = buildFixture({});
    const expiresAt = new Date(Date.now() + 60_000);

    await service.scheduleTimeout('r1', expiresAt);

    expect(enqueued[0]?.name).toBe(JOB_NAMES.DEPOSITO_TIMEOUT);
    expect(enqueued[0]?.delay).toBeGreaterThan(55_000);
    expect(enqueued[0]?.delay).toBeLessThanOrEqual(60_000);
  });

  it('si Redis no acepta el job no rompe el flujo: lo cubre el barrido', async () => {
    const { service } = buildFixture({ queueError: new Error('redis caído') });
    await expect(
      service.scheduleTimeout('r1', new Date()),
    ).resolves.toBeUndefined();
  });
});
