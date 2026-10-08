import {
  DepositCoverage,
  DepositRecord,
  DepositStatus,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ConfirmDepositOrchestrator } from '../../reservations/orchestrators/confirm-deposit.orchestrator';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { DepositCreditService } from '../../reservations/service/deposit-credit.service';
import { DepositsRepository } from '../repositories/deposits.repositories';
import {
  ApproveDepositCommand,
  ApproveDepositOrchestrator,
} from './approve-deposit.orchestrator';

const reservation = (
  id: string,
  status: ReservationStatus = ReservationStatus.PENDIENTE_DEPOSITO,
): Reservation =>
  ({
    id,
    status,
    clientId: 'c1',
    comboGroupId: null,
    scheduledStart: new Date('2026-12-09T13:00:00Z'),
  }) as Reservation;

const deposit = (id: string, status: DepositStatus): DepositRecord =>
  ({ id, status }) as DepositRecord;

interface FixtureOptions {
  anchor: Reservation;
  group?: Reservation[];
  creditCovered?: string[];
  latestByReservation?: Record<string, DepositRecord | null>;
  markIfPendingResult?: boolean;
}

const buildFixture = (options: FixtureOptions) => {
  const calls = {
    confirmed: [] as string[],
    created: [] as Array<{ reservationId: string; amount: number }>,
    markConfirmed: [] as Array<{ id: string; amount: number }>,
    markIfPending: [] as Array<{ id: string; amount: number }>,
    covered: [] as Array<{ ids: readonly string[]; depositId: string }>,
    afterConfirmed: [] as string[],
  };
  const credit = new Set(options.creditCovered ?? []);

  const prisma = {
    client: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) },
  };
  const repository = {
    findLatestByReservationId: (id: string) =>
      Promise.resolve(options.latestByReservation?.[id] ?? null),
    createConfirmedWithoutProof: (
      reservationId: string,
      _admin: string,
      _coverage: DepositCoverage,
      amount: number,
    ) => {
      calls.created.push({ reservationId, amount });
      return Promise.resolve(deposit(`new-${reservationId}`, 'CONFIRMADO'));
    },
    markConfirmed: (
      id: string,
      _admin: string,
      _coverage: DepositCoverage,
      amount: number,
    ) => {
      calls.markConfirmed.push({ id, amount });
      return Promise.resolve(deposit(id, 'CONFIRMADO'));
    },
    markConfirmedIfPending: (
      id: string,
      _admin: string,
      _coverage: DepositCoverage,
      amount: number,
    ) => {
      calls.markIfPending.push({ id, amount });
      return Promise.resolve(options.markIfPendingResult ?? true);
    },
  };
  const reservationsRepository = {
    findById: () => Promise.resolve(options.anchor),
    findByClientAndDayWithStatus: () =>
      Promise.resolve(options.group ?? [options.anchor]),
    setCoveredByDeposit: (ids: readonly string[], depositId: string) => {
      calls.covered.push({ ids, depositId });
      return Promise.resolve();
    },
  };
  const confirmDeposit = {
    confirmStatus: (id: string) => {
      calls.confirmed.push(id);
      return Promise.resolve(reservation(id, ReservationStatus.CONFIRMADA));
    },
    afterConfirmed: (r: Reservation) => {
      calls.afterConfirmed.push(r.id);
      return Promise.resolve();
    },
  };
  const depositCredit = {
    isCoveredByCredit: (r: { id: string }) => Promise.resolve(credit.has(r.id)),
  };

  const orchestrator = new ApproveDepositOrchestrator(
    prisma as unknown as PrismaService,
    repository as unknown as DepositsRepository,
    reservationsRepository as unknown as ReservationsRepository,
    confirmDeposit as unknown as ConfirmDepositOrchestrator,
    depositCredit as unknown as DepositCreditService,
  );
  return { orchestrator, calls };
};

const command = (
  overrides: Partial<ApproveDepositCommand> = {},
): ApproveDepositCommand => ({
  reservationId: 'a',
  adminUserId: 'admin',
  coverage: DepositCoverage.ANTICIPO,
  amount: 35,
  ...overrides,
});

const expectCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
};

describe('ApproveDepositOrchestrator', () => {
  describe('reserva esperando depósito', () => {
    it('confirma y registra el monto real del comprobante pendiente', async () => {
      const { orchestrator, calls } = buildFixture({
        anchor: reservation('a'),
        latestByReservation: { a: deposit('d1', 'PENDIENTE') },
      });

      const result = await orchestrator.execute(command({ amount: 15 }));

      expect(result).toEqual({
        approvedReservationIds: ['a'],
        depositId: 'd1',
      });
      expect(calls.markConfirmed).toEqual([{ id: 'd1', amount: 15 }]);
      expect(calls.afterConfirmed).toEqual(['a']);
    });

    it('acepta un monto menor al adelanto mínimo (decide el admin)', async () => {
      const { orchestrator, calls } = buildFixture({
        anchor: reservation('a'),
      });

      await orchestrator.execute(command({ amount: 5 }));

      expect(calls.created).toEqual([{ reservationId: 'a', amount: 5 }]);
    });

    it('exige el monto cuando hay que registrar dinero', async () => {
      const { orchestrator } = buildFixture({ anchor: reservation('a') });

      await expectCode(
        orchestrator.execute(command({ amount: undefined })),
        'DEPOSIT_AMOUNT_REQUIRED',
      );
    });

    it('grupo: un solo depósito en el ancla y las demás filas cubiertas por él', async () => {
      const { orchestrator, calls } = buildFixture({
        anchor: reservation('a'),
        group: [reservation('b'), reservation('a'), reservation('c')],
        latestByReservation: { a: deposit('d1', 'PENDIENTE') },
      });

      const result = await orchestrator.execute(command({ amount: 60 }));

      expect(result.approvedReservationIds).toEqual(['b', 'a', 'c']);
      expect(calls.markConfirmed).toEqual([{ id: 'd1', amount: 60 }]);
      expect(calls.created).toEqual([]);
      expect(calls.covered).toEqual([{ ids: ['b', 'c'], depositId: 'd1' }]);
    });

    it('SINGLE no toca las demás filas del día', async () => {
      const { orchestrator, calls } = buildFixture({
        anchor: reservation('a'),
        group: [reservation('a'), reservation('b')],
      });

      await orchestrator.execute(command({ scope: 'SINGLE' }));

      expect(calls.confirmed).toEqual(['a']);
      expect(calls.covered).toEqual([{ ids: [], depositId: 'new-a' }]);
    });

    it('si el ancla tiene crédito, paga la primera fila sin crédito', async () => {
      const { orchestrator, calls } = buildFixture({
        anchor: reservation('a'),
        group: [reservation('a'), reservation('b'), reservation('c')],
        creditCovered: ['a'],
      });

      await orchestrator.execute(command({ amount: 40 }));

      expect(calls.created).toEqual([{ reservationId: 'b', amount: 40 }]);
      expect(calls.covered).toEqual([{ ids: ['c'], depositId: 'new-b' }]);
    });

    it('todo cubierto por crédito: confirma sin pedir monto ni crear depósito', async () => {
      const { orchestrator, calls } = buildFixture({
        anchor: reservation('a'),
        creditCovered: ['a'],
      });

      const result = await orchestrator.execute(command({ amount: undefined }));

      expect(result).toEqual({
        approvedReservationIds: ['a'],
        depositId: null,
      });
      expect(calls.created).toEqual([]);
      expect(calls.markConfirmed).toEqual([]);
    });
  });

  describe('reserva en otro estado (el comprobante se aprueba igual)', () => {
    it.each([
      ReservationStatus.CANCELADA,
      ReservationStatus.NO_SHOW,
      ReservationStatus.CONFIRMADA,
    ])(
      '%s: confirma solo el depósito, sin tocar la reserva',
      async (status) => {
        const { orchestrator, calls } = buildFixture({
          anchor: reservation('a', status),
          latestByReservation: { a: deposit('d1', 'PENDIENTE') },
        });

        const result = await orchestrator.execute(command({ amount: 20 }));

        expect(result).toEqual({ approvedReservationIds: [], depositId: 'd1' });
        expect(calls.markIfPending).toEqual([{ id: 'd1', amount: 20 }]);
        expect(calls.confirmed).toEqual([]);
        expect(calls.afterConfirmed).toEqual([]);
      },
    );

    it('sin comprobante pendiente → DEPOSIT_NOT_PENDING', async () => {
      const { orchestrator } = buildFixture({
        anchor: reservation('a', ReservationStatus.CANCELADA),
        latestByReservation: { a: deposit('d1', 'RECHAZADO') },
      });

      await expectCode(orchestrator.execute(command()), 'DEPOSIT_NOT_PENDING');
    });

    it('exige el monto', async () => {
      const { orchestrator } = buildFixture({
        anchor: reservation('a', ReservationStatus.CANCELADA),
        latestByReservation: { a: deposit('d1', 'PENDIENTE') },
      });

      await expectCode(
        orchestrator.execute(command({ amount: undefined })),
        'DEPOSIT_AMOUNT_REQUIRED',
      );
    });

    it('si otro proceso lo cambió antes → DEPOSIT_CONCURRENT_CHANGE', async () => {
      const { orchestrator } = buildFixture({
        anchor: reservation('a', ReservationStatus.CANCELADA),
        latestByReservation: { a: deposit('d1', 'PENDIENTE') },
        markIfPendingResult: false,
      });

      await expectCode(
        orchestrator.execute(command()),
        'DEPOSIT_CONCURRENT_CHANGE',
      );
    });
  });
});
