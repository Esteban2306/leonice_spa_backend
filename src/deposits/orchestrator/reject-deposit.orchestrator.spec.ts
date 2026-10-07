import { NotFoundException } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainException } from '../../common/exceptions/domain.exception';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { EventBusService } from '../../common/events/event.service';
import { JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import { DEPOSITO_TIMEOUT_MS } from '../../reservations/domain/reservation-timing.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { RejectDepositOrchestrator } from './reject-deposit.orchestrator';

interface FixtureOptions {
  latestDepositStatus: DepositStatus | null;
  reservationStatus: ReservationStatus;
  queueError?: Error;
}

interface Enqueued {
  name: string;
  data: { reservationId: string };
  delay: number | undefined;
}

interface Published {
  type: string;
  payload: Record<string, unknown>;
}

const buildFixture = (options: FixtureOptions) => {
  const calls: string[] = [];
  const enqueued: Enqueued[] = [];
  const published: Published[] = [];

  const depositsRepository = {
    findLatestByReservationId: () =>
      Promise.resolve(
        options.latestDepositStatus
          ? { id: 'd1', status: options.latestDepositStatus }
          : null,
      ),
    markRejected: () => {
      calls.push('reject');
      return Promise.resolve({ id: 'd1' });
    },
  };
  const reservationsRepository = {
    findByIdWithClientPhone: () =>
      Promise.resolve({
        id: 'r1',
        clientId: 'c1',
        status: options.reservationStatus,
        client: { phone: '573000000000', name: 'Ana' },
      }),
    extendDepositDeadline: () => {
      calls.push('extend');
      return Promise.resolve({});
    },
  };
  const queue = {
    add: (
      name: string,
      data: { reservationId: string },
      opts?: { delay?: number },
    ) => {
      calls.push('enqueue');
      enqueued.push({ name, data, delay: opts?.delay });
      return options.queueError
        ? Promise.reject(options.queueError)
        : Promise.resolve({});
    },
  };
  const eventBus = {
    publish: (type: string, payload: Record<string, unknown>) => {
      calls.push('publish');
      published.push({ type, payload });
    },
  };

  const orchestrator = new RejectDepositOrchestrator(
    depositsRepository as unknown as DepositsRepository,
    reservationsRepository as unknown as ReservationsRepository,
    queue as unknown as Queue,
    eventBus as unknown as EventBusService,
  );

  return { orchestrator, calls, enqueued, published };
};

describe('RejectDepositOrchestrator', () => {
  it('extiende el plazo, rechaza, encola y avisa, en ese orden', async () => {
    const { orchestrator, calls, enqueued, published } = buildFixture({
      latestDepositStatus: DepositStatus.PENDIENTE,
      reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
    });

    await orchestrator.execute('r1', 'admin1', 'Comprobante ilegible');

    expect(calls).toEqual(['extend', 'reject', 'enqueue', 'publish']);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.name).toBe(JOB_NAMES.DEPOSITO_TIMEOUT);
    expect(enqueued[0]?.delay).toBeGreaterThan(DEPOSITO_TIMEOUT_MS - 5_000);
    expect(enqueued[0]?.delay).toBeLessThanOrEqual(DEPOSITO_TIMEOUT_MS);
    expect(published[0]?.type).toBe(EVENT_TYPES.DEPOSIT_REJECTED);
    expect(published[0]?.payload).toMatchObject({
      reservationId: 'r1',
      clientId: 'c1',
      clientPhone: '573000000000',
      reason: 'Comprobante ilegible',
    });
  });

  it('si la reserva ya no espera depósito, solo rechaza: sin plazo, job ni aviso', async () => {
    const { orchestrator, calls } = buildFixture({
      latestDepositStatus: DepositStatus.PENDIENTE,
      reservationStatus: ReservationStatus.CANCELADA,
    });

    await orchestrator.execute('r1', 'admin1', 'motivo');

    expect(calls).toEqual(['reject']);
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

  it('si Redis no acepta el job, el rechazo y el aviso siguen adelante (lo cubre el barrido)', async () => {
    const { orchestrator, calls } = buildFixture({
      latestDepositStatus: DepositStatus.PENDIENTE,
      reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
      queueError: new Error('redis caído'),
    });

    await expect(
      orchestrator.execute('r1', 'admin1', 'motivo'),
    ).resolves.toBeDefined();
    expect(calls).toEqual(['extend', 'reject', 'enqueue', 'publish']);
  });
});
