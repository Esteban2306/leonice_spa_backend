import {
  AutomationExecutionResult,
  AutomationExecutionType,
  ReservationStatus,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { AdminCancelReservationOrchestrator } from '../../reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from '../../reservations/orchestrators/mark-no-show.orchestrator';
import { AutomationExecutionRepository } from '../repositories/automation-execution.repository';
import { ReservationTimeoutsProcessor } from './reservation-timeouts.processor';

interface CancelCall {
  id: string;
  reason: string | undefined;
  notify: boolean;
}

interface LoggedExecution {
  type: AutomationExecutionType;
  result: AutomationExecutionResult;
  reservationId?: string;
  reason?: string;
}

interface FixtureOptions {
  cancelError?: Error;
  hasSubmittedProof?: boolean;
  depositExpiresAt?: Date | null;
  overdueIds?: string[];
  scheduledStart?: Date;
}

const EXPIRED_DEADLINE = new Date(Date.now() - 60_000);

const buildJob = (name: string): Job<{ reservationId: string }> =>
  ({ name, data: { reservationId: 'r1' } }) as unknown as Job<{
    reservationId: string;
  }>;

const buildFixture = (
  status: ReservationStatus | null,
  options: FixtureOptions = {},
) => {
  const cancelCalls: CancelCall[] = [];
  const logged: LoggedExecution[] = [];
  const noShowCalls: string[] = [];
  const sweepWindows: Array<{ startedBefore: Date; startedAfter: Date }> = [];

  const repository = {
    findById: () =>
      Promise.resolve(
        status
          ? {
              id: 'r1',
              status,
              checkedInAt: null,
              scheduledStart: options.scheduledStart ?? new Date(0),
              depositExpiresAt:
                options.depositExpiresAt === undefined
                  ? EXPIRED_DEADLINE
                  : options.depositExpiresAt,
            }
          : null,
      ),
    hasSubmittedProof: () =>
      Promise.resolve(options.hasSubmittedProof ?? false),
    findOverdueConfirmedIds: (params: {
      startedBefore: Date;
      startedAfter: Date;
    }) => {
      sweepWindows.push(params);
      return Promise.resolve(options.overdueIds ?? []);
    },
  };
  const markNoShow = {
    execute: (id: string) => {
      noShowCalls.push(id);
      return Promise.resolve({ id });
    },
  };
  const adminCancel = {
    execute: (id: string, reason: string | undefined, notify: boolean) => {
      cancelCalls.push({ id, reason, notify });
      return options.cancelError
        ? Promise.reject(options.cancelError)
        : Promise.resolve();
    },
  };
  const executions = {
    log: (entry: LoggedExecution) => {
      logged.push(entry);
      return Promise.resolve();
    },
  };

  const processor = new ReservationTimeoutsProcessor(
    repository as unknown as ReservationsRepository,
    adminCancel as unknown as AdminCancelReservationOrchestrator,
    markNoShow as unknown as MarkNoShowOrchestrator,
    executions as unknown as AutomationExecutionRepository,
  );

  return { processor, cancelCalls, logged, noShowCalls, sweepWindows };
};

describe('ReservationTimeoutsProcessor', () => {
  it('cancela en silencio un depósito vencido sin comprobante y registra EXECUTED', async () => {
    const { processor, cancelCalls, logged } = buildFixture(
      ReservationStatus.PENDIENTE_DEPOSITO,
    );

    await processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT));

    expect(cancelCalls).toEqual([
      { id: 'r1', reason: 'Depósito no confirmado a tiempo', notify: false },
    ]);
    expect(logged[0]?.result).toBe(AutomationExecutionResult.EXECUTED);
  });

  it('no cancela si hay un comprobante pendiente de revisión', async () => {
    const { processor, cancelCalls, logged } = buildFixture(
      ReservationStatus.PENDIENTE_DEPOSITO,
      { hasSubmittedProof: true },
    );

    await processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT));

    expect(cancelCalls).toHaveLength(0);
    expect(logged[0]?.result).toBe(AutomationExecutionResult.SKIPPED);
    expect(logged[0]?.reason).toContain('comprobante');
  });

  it('no cancela una reserva sin plazo de depósito (revivida)', async () => {
    const { processor, cancelCalls, logged } = buildFixture(
      ReservationStatus.PENDIENTE_DEPOSITO,
      { depositExpiresAt: null },
    );

    await processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT));

    expect(cancelCalls).toHaveLength(0);
    expect(logged[0]?.result).toBe(AutomationExecutionResult.SKIPPED);
  });

  it('ignora un valoracion-timeout ya encolado y no cancela', async () => {
    const { processor, cancelCalls, logged } = buildFixture(
      ReservationStatus.PENDIENTE_VALORACION,
    );

    await processor.process(buildJob(JOB_NAMES.VALORACION_TIMEOUT));

    expect(cancelCalls).toHaveLength(0);
    expect(logged[0]?.type).toBe(AutomationExecutionType.VALORACION_TIMEOUT);
    expect(logged[0]?.result).toBe(AutomationExecutionResult.SKIPPED);
  });

  it('no cancela si la reserva ya cambió de estado y registra SKIPPED', async () => {
    const { processor, cancelCalls, logged } = buildFixture(
      ReservationStatus.CONFIRMADA,
    );

    await processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT));

    expect(cancelCalls).toHaveLength(0);
    expect(logged[0]?.result).toBe(AutomationExecutionResult.SKIPPED);
  });

  it('convierte un 4xx en UnrecoverableError (sin reintentos)', async () => {
    const { processor } = buildFixture(ReservationStatus.PENDIENTE_DEPOSITO, {
      cancelError: new ForbiddenException('nope'),
    });

    await expect(
      processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('deja pasar errores transitorios para que BullMQ reintente', async () => {
    const { processor } = buildFixture(ReservationStatus.PENDIENTE_DEPOSITO, {
      cancelError: new Error('conexión caída'),
    });

    const result = processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT));

    await expect(result).rejects.toThrow('conexión caída');
    await expect(result).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('el barrido no-show marca las citas confirmadas sin check-in pasada la gracia', async () => {
    const { processor, noShowCalls, sweepWindows, logged } = buildFixture(
      ReservationStatus.CONFIRMADA,
      { overdueIds: ['r1'] },
    );

    await processor.process(buildJob(JOB_NAMES.NO_SHOW_SWEEP));

    expect(noShowCalls).toEqual(['r1']);
    const window = sweepWindows[0];
    expect(Date.now() - window.startedBefore.getTime()).toBeGreaterThanOrEqual(
      15 * 60_000,
    );
    expect(Date.now() - window.startedAfter.getTime()).toBeGreaterThanOrEqual(
      7 * 24 * 3_600_000,
    );
    expect(logged.at(-1)).toMatchObject({
      type: AutomationExecutionType.NO_SHOW_CHECK,
      result: AutomationExecutionResult.EXECUTED,
    });
  });

  it('el barrido no-show respeta una cita que ya hizo check-in o cambió', async () => {
    const { processor, noShowCalls, logged } = buildFixture(
      ReservationStatus.CITA_EN_CURSO,
      { overdueIds: ['r1'] },
    );

    await processor.process(buildJob(JOB_NAMES.NO_SHOW_SWEEP));

    expect(noShowCalls).toEqual([]);
    expect(logged.at(-1)?.result).toBe(AutomationExecutionResult.SKIPPED);
  });
});
