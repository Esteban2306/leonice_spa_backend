import {
  AutomationExecutionResult,
  AutomationExecutionType,
  ReservationStatus,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { AdminCancelReservationOrchestrator } from '../../reservations/orchestrators/admin-cancel-reservation.orchestrator';
import type { EventBusService } from '../../common/events/event.service';
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
  inProgress?: Array<{
    id: string;
    scheduledStart: Date;
    client: { name: string };
    treatment: { name: string };
  }>;
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
  const sweepCutoffs: Date[] = [];
  const inProgressQueries: Array<{ startedBefore: Date; limit: number }> = [];

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
    findInProgressStartedBefore: (startedBefore: Date, limit: number) => {
      inProgressQueries.push({ startedBefore, limit });
      return Promise.resolve(options.inProgress ?? []);
    },
    findOverdueUnattendedIds: (startedBefore: Date) => {
      sweepCutoffs.push(startedBefore);
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

  const published: Array<{ type: string; payload: unknown }> = [];
  const eventBus = {
    publish: (type: string, payload: unknown) => {
      published.push({ type, payload });
    },
  };

  const processor = new ReservationTimeoutsProcessor(
    repository as unknown as ReservationsRepository,
    adminCancel as unknown as AdminCancelReservationOrchestrator,
    markNoShow as unknown as MarkNoShowOrchestrator,
    executions as unknown as AutomationExecutionRepository,
    eventBus as unknown as EventBusService,
  );

  return {
    processor,
    cancelCalls,
    logged,
    noShowCalls,
    sweepCutoffs,
    published,
    inProgressQueries,
  };
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

  it.each([
    'RESERVATION_CONCURRENT_CHANGE',
    'RESERVATION_INVALID_TRANSITION',
  ] as const)(
    'si otra copia del job ganó la carrera (%s) registra SKIPPED y no falla',
    async (code) => {
      const { processor, logged } = buildFixture(
        ReservationStatus.PENDIENTE_DEPOSITO,
        { cancelError: new AppException(code) },
      );

      await expect(
        processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT)),
      ).resolves.toBeUndefined();
      expect(logged).toEqual([
        expect.objectContaining({
          result: AutomationExecutionResult.SKIPPED,
          reason: 'La reserva cambió de estado durante la cancelación',
        }),
      ]);
    },
  );

  it('otros AppException 4xx siguen siendo irrecuperables', async () => {
    const { processor } = buildFixture(ReservationStatus.PENDIENTE_DEPOSITO, {
      cancelError: new AppException('RESERVATION_NOT_OWNED'),
    });

    await expect(
      processor.process(buildJob(JOB_NAMES.DEPOSITO_TIMEOUT)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
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
    const { processor, noShowCalls, sweepCutoffs, logged } = buildFixture(
      ReservationStatus.CONFIRMADA,
      { overdueIds: ['r1'] },
    );

    await processor.process(buildJob(JOB_NAMES.NO_SHOW_SWEEP));

    expect(noShowCalls).toEqual(['r1']);
    expect(Date.now() - sweepCutoffs[0].getTime()).toBeGreaterThanOrEqual(
      15 * 60_000,
    );
    expect(logged.at(-1)).toMatchObject({
      type: AutomationExecutionType.NO_SHOW_CHECK,
      result: AutomationExecutionResult.EXECUTED,
      reason: 'Pasó la hora de la cita sin check-in',
    });
  });

  it.each([
    ReservationStatus.SOLICITUD_INICIADA,
    ReservationStatus.PENDIENTE_VALORACION,
    ReservationStatus.PENDIENTE_DEPOSITO,
  ])(
    'una cita vencida en %s también pasa a no asistió y deja su estado anterior',
    async (status) => {
      const { processor, noShowCalls, logged } = buildFixture(status, {
        overdueIds: ['r1'],
      });

      await processor.process(buildJob(JOB_NAMES.NO_SHOW_SWEEP));

      expect(noShowCalls).toEqual(['r1']);
      expect(logged.at(-1)).toMatchObject({
        type: AutomationExecutionType.NO_SHOW_CHECK,
        result: AutomationExecutionResult.EXECUTED,
      });
      expect(logged.at(-1)?.reason).toContain(`estaba en ${status}`);
    },
  );

  it.each([
    ReservationStatus.COMPLETADA,
    ReservationStatus.CANCELADA,
    ReservationStatus.REPROGRAMADA,
    ReservationStatus.NO_SHOW,
  ])('una cita en %s no se toca', async (status) => {
    const { processor, noShowCalls } = buildFixture(status, {
      overdueIds: ['r1'],
    });

    await processor.process(buildJob(JOB_NAMES.NO_SHOW_SWEEP));

    expect(noShowCalls).toEqual([]);
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

  it('al cierre del día avisa las citas en curso sin completar, sin completarlas', async () => {
    const start = new Date('2026-11-17T15:00:00Z');
    const {
      processor,
      published,
      inProgressQueries,
      noShowCalls,
      cancelCalls,
    } = buildFixture(null, {
      inProgress: [
        {
          id: 'r9',
          scheduledStart: start,
          client: { name: 'Luz Marina' },
          treatment: { name: 'Hidratación' },
        },
      ],
    });

    await processor.process(buildJob(JOB_NAMES.IN_PROGRESS_DIGEST));

    expect(
      Date.now() - inProgressQueries[0].startedBefore.getTime(),
    ).toBeLessThan(5_000);
    expect(published).toHaveLength(1);
    expect(published[0].type).toBe('reservations.in_progress_pending');
    expect(published[0].payload).toMatchObject({
      total: 1,
      items: [
        {
          reservationId: 'r9',
          clientName: 'Luz Marina',
          treatmentName: 'Hidratación',
          scheduledStart: start,
        },
      ],
    });
    expect((published[0].payload as { digestId: string }).digestId).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(noShowCalls).toEqual([]);
    expect(cancelCalls).toEqual([]);
  });

  it('al cierre del día no avisa nada si no hay citas en curso', async () => {
    const { processor, published } = buildFixture(null, { inProgress: [] });

    await processor.process(buildJob(JOB_NAMES.IN_PROGRESS_DIGEST));

    expect(published).toEqual([]);
  });
});
