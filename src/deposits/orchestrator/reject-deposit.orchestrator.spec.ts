import { NotFoundException } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { EventBusService } from '../../common/events/event.service';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { DepositDeadlineService } from '../../reservations/service/deposit-deadline.service';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { RejectDepositOrchestrator } from './reject-deposit.orchestrator';

interface FixtureOptions {
  latestDepositStatus: DepositStatus | null;
  reservationStatus: ReservationStatus;
  rejectApplies?: boolean;
  deadlineRestartApplies?: boolean;
}

const SCHEDULED_START = new Date(2026, 9, 23, 9, 0);
const COMPUTED_EXPIRY = new Date(2026, 9, 22, 15, 0);

interface Computed {
  startedAt: Date;
  notAfter: Date;
}

interface Published {
  type: string;
  payload: Record<string, unknown>;
}

const buildFixture = (options: FixtureOptions) => {
  const calls: string[] = [];
  const computed: Computed[] = [];
  const restarted: Array<{
    depositClockStartedAt: Date;
    depositExpiresAt: Date;
  }> = [];
  const scheduled: Array<{ reservationId: string; expiresAt: Date }> = [];
  const published: Published[] = [];

  const depositsRepository = {
    findLatestByReservationId: () =>
      Promise.resolve(
        options.latestDepositStatus
          ? { id: 'd1', status: options.latestDepositStatus }
          : null,
      ),
    markRejectedIfPending: () => {
      calls.push('reject');
      return Promise.resolve(options.rejectApplies ?? true);
    },
    findById: (id: string) =>
      Promise.resolve({ id, status: DepositStatus.RECHAZADO }),
  };
  const reservationsRepository = {
    findByIdWithClientPhone: () =>
      Promise.resolve({
        id: 'r1',
        clientId: 'c1',
        status: options.reservationStatus,
        scheduledStart: SCHEDULED_START,
        client: { phone: '573000000000', name: 'Ana' },
      }),
    restartDepositDeadlineIfAwaiting: (
      _id: string,
      deadline: { depositClockStartedAt: Date; depositExpiresAt: Date },
    ) => {
      calls.push('extend');
      restarted.push(deadline);
      return Promise.resolve(options.deadlineRestartApplies ?? true);
    },
  };
  const depositDeadline = {
    computeExpiry: (startedAt: Date, notAfter: Date) => {
      computed.push({ startedAt, notAfter });
      return Promise.resolve(COMPUTED_EXPIRY);
    },
    scheduleTimeout: (reservationId: string, expiresAt: Date) => {
      calls.push('enqueue');
      scheduled.push({ reservationId, expiresAt });
      return Promise.resolve();
    },
  };
  const eventBus = {
    publish: (type: string, payload: Record<string, unknown>) => {
      calls.push('publish');
      published.push({ type, payload });
    },
  };

  const prisma = {
    client: {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        calls.push('tx:begin');
        const result = await fn({});
        calls.push('tx:commit');
        return result;
      },
    },
  };

  const orchestrator = new RejectDepositOrchestrator(
    prisma as unknown as PrismaService,
    depositsRepository as unknown as DepositsRepository,
    reservationsRepository as unknown as ReservationsRepository,
    depositDeadline as unknown as DepositDeadlineService,
    eventBus as unknown as EventBusService,
  );

  return { orchestrator, calls, computed, restarted, scheduled, published };
};

describe('RejectDepositOrchestrator', () => {
  it('rechaza y reinicia el plazo en una sola transacción, y después encola y avisa', async () => {
    const { orchestrator, calls, computed, restarted, scheduled, published } =
      buildFixture({
        latestDepositStatus: DepositStatus.PENDIENTE,
        reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
      });

    await orchestrator.execute('r1', 'admin1', 'Comprobante ilegible');

    expect(calls).toEqual([
      'tx:begin',
      'reject',
      'extend',
      'tx:commit',
      'enqueue',
      'publish',
    ]);
    expect(computed).toHaveLength(1);
    expect(computed[0]?.notAfter).toEqual(SCHEDULED_START);
    expect(restarted[0]).toEqual({
      depositClockStartedAt: computed[0]?.startedAt,
      depositExpiresAt: COMPUTED_EXPIRY,
    });
    expect(scheduled).toEqual([
      { reservationId: 'r1', expiresAt: COMPUTED_EXPIRY },
    ]);
    expect(published[0]?.type).toBe(EVENT_TYPES.DEPOSIT_REJECTED);
    expect(published[0]?.payload).toMatchObject({
      reservationId: 'r1',
      clientId: 'c1',
      clientPhone: '573000000000',
      reason: 'Comprobante ilegible',
      newDeadline: COMPUTED_EXPIRY,
    });
  });

  it('si la reserva ya no espera depósito, rechaza y avisa sin plazo ni job', async () => {
    const { orchestrator, calls, computed, published } = buildFixture({
      latestDepositStatus: DepositStatus.PENDIENTE,
      reservationStatus: ReservationStatus.CANCELADA,
    });

    await orchestrator.execute('r1', 'admin1', 'motivo');

    expect(calls).toEqual(['tx:begin', 'reject', 'tx:commit', 'publish']);
    expect(computed).toHaveLength(0);
    expect(published[0]?.payload).toMatchObject({ newDeadline: null });
  });

  it('lanza NotFound si no hay comprobante', async () => {
    const { orchestrator, calls } = buildFixture({
      latestDepositStatus: null,
      reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
    });

    await expect(
      orchestrator.execute('r1', 'admin1', 'motivo'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toHaveLength(0);
  });

  it('lanza DomainException si el comprobante ya fue procesado', async () => {
    const { orchestrator, calls } = buildFixture({
      latestDepositStatus: DepositStatus.CONFIRMADO,
      reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
    });

    await expect(
      orchestrator.execute('r1', 'admin1', 'motivo'),
    ).rejects.toBeInstanceOf(DomainException);
    expect(calls).toHaveLength(0);
  });

  it('si otro proceso ya procesó el comprobante responde DEPOSIT_CONCURRENT_CHANGE sin reiniciar plazo, encolar ni avisar', async () => {
    const { orchestrator, calls, published, scheduled } = buildFixture({
      latestDepositStatus: DepositStatus.PENDIENTE,
      reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
      rejectApplies: false,
    });

    const error = await orchestrator
      .execute('r1', 'admin1', 'motivo')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('DEPOSIT_CONCURRENT_CHANGE');
    expect(calls).toEqual(['tx:begin', 'reject']);
    expect(scheduled).toHaveLength(0);
    expect(published).toHaveLength(0);
  });

  it('si la reserva dejó de esperar depósito durante el rechazo, no encola vencimiento y avisa sin plazo', async () => {
    const { orchestrator, scheduled, published } = buildFixture({
      latestDepositStatus: DepositStatus.PENDIENTE,
      reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
      deadlineRestartApplies: false,
    });

    await orchestrator.execute('r1', 'admin1', 'motivo');

    expect(scheduled).toHaveLength(0);
    expect(published[0]?.payload).toMatchObject({ newDeadline: null });
  });
});
