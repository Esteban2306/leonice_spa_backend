import { NotFoundException } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
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
        scheduledStart: SCHEDULED_START,
        client: { phone: '573000000000', name: 'Ana' },
      }),
    restartDepositDeadline: (
      _id: string,
      deadline: { depositClockStartedAt: Date; depositExpiresAt: Date },
    ) => {
      calls.push('extend');
      restarted.push(deadline);
      return Promise.resolve({});
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

  const orchestrator = new RejectDepositOrchestrator(
    depositsRepository as unknown as DepositsRepository,
    reservationsRepository as unknown as ReservationsRepository,
    depositDeadline as unknown as DepositDeadlineService,
    eventBus as unknown as EventBusService,
  );

  return { orchestrator, calls, computed, restarted, scheduled, published };
};

describe('RejectDepositOrchestrator', () => {
  it('reinicia el plazo en horario hábil, rechaza, encola y avisa, en ese orden', async () => {
    const { orchestrator, calls, computed, restarted, scheduled, published } =
      buildFixture({
        latestDepositStatus: DepositStatus.PENDIENTE,
        reservationStatus: ReservationStatus.PENDIENTE_DEPOSITO,
      });

    await orchestrator.execute('r1', 'admin1', 'Comprobante ilegible');

    expect(calls).toEqual(['extend', 'reject', 'enqueue', 'publish']);
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

    expect(calls).toEqual(['reject', 'publish']);
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
});
