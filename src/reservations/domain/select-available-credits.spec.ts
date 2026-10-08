import { DepositStatus, ReservationStatus } from '@prisma/client';
import {
  CreditCandidate,
  effectiveAppliedStatus,
  selectAvailableCredits,
} from './select-available-credits';

const make = (
  overrides: Partial<CreditCandidate> & { depositId: string },
): CreditCandidate => ({
  amount: 20,
  originReservationId: 'r1',
  status: DepositStatus.CONFIRMADO,
  hasProofImage: true,
  originStatus: ReservationStatus.CANCELADA,
  coveredStatuses: [],
  appliedToReservationId: null,
  appliedToStatus: null,
  confirmedAt: new Date('2026-10-01T10:00:00Z'),
  ...overrides,
});

const ids = (list: CreditCandidate[]) => list.map((c) => c.depositId);

describe('selectAvailableCredits', () => {
  it('un depósito de grupo no es crédito mientras alguna fila cubierta siga viva', () => {
    const groupDeposit = make({
      depositId: 'g',
      coveredStatuses: [
        ReservationStatus.CANCELADA,
        ReservationStatus.CONFIRMADA,
      ],
    });
    expect(ids(selectAvailableCredits([groupDeposit]))).toEqual([]);
  });

  it('un depósito de grupo es crédito cuando todas sus filas están canceladas o no-show', () => {
    const groupDeposit = make({
      depositId: 'g',
      coveredStatuses: [ReservationStatus.CANCELADA, ReservationStatus.NO_SHOW],
    });
    expect(ids(selectAvailableCredits([groupDeposit]))).toEqual(['g']);
  });

  it('acepta un depósito confirmado con imagen de una reserva cancelada', () => {
    expect(ids(selectAvailableCredits([make({ depositId: 'a' })]))).toEqual([
      'a',
    ]);
  });

  it('acepta el de una reserva NO_SHOW', () => {
    const c = make({ depositId: 'a', originStatus: ReservationStatus.NO_SHOW });
    expect(ids(selectAvailableCredits([c]))).toEqual(['a']);
  });

  it('rechaza un depósito sin imagen', () => {
    const c = make({ depositId: 'a', hasProofImage: false });
    expect(selectAvailableCredits([c])).toEqual([]);
  });

  it('rechaza un depósito histórico sin monto registrado', () => {
    expect(
      selectAvailableCredits([make({ depositId: 'a', amount: null })]),
    ).toEqual([]);
  });

  it('acepta cualquier monto registrado, sin mínimo', () => {
    expect(
      ids(selectAvailableCredits([make({ depositId: 'a', amount: 5 })])),
    ).toEqual(['a']);
  });

  it('rechaza depósitos no confirmados', () => {
    for (const status of [
      DepositStatus.PENDIENTE,
      DepositStatus.RECHAZADO,
      DepositStatus.CONVERTIDO_A_CREDITO,
    ]) {
      expect(
        selectAvailableCredits([make({ depositId: 'a', status })]),
      ).toEqual([]);
    }
  });

  it('rechaza si la reserva de origen sigue viva (la revivida no genera crédito)', () => {
    for (const originStatus of [
      ReservationStatus.CONFIRMADA,
      ReservationStatus.CITA_EN_CURSO,
      ReservationStatus.COMPLETADA,
    ]) {
      expect(
        selectAvailableCredits([make({ depositId: 'a', originStatus })]),
      ).toEqual([]);
    }
  });

  it('un crédito aplicado a una reserva viva no está disponible', () => {
    for (const appliedToStatus of [
      ReservationStatus.PENDIENTE_DEPOSITO,
      ReservationStatus.CONFIRMADA,
      ReservationStatus.CITA_EN_CURSO,
    ]) {
      const c = make({
        depositId: 'a',
        appliedToReservationId: 'r1',
        appliedToStatus,
      });
      expect(selectAvailableCredits([c])).toEqual([]);
    }
  });

  it('un crédito aplicado a una reserva COMPLETADA queda consumido', () => {
    const c = make({
      depositId: 'a',
      appliedToReservationId: 'r1',
      appliedToStatus: ReservationStatus.COMPLETADA,
    });
    expect(selectAvailableCredits([c])).toEqual([]);
  });

  it('un crédito aplicado a una reserva cancelada o no-show vuelve a quedar libre', () => {
    for (const appliedToStatus of [
      ReservationStatus.CANCELADA,
      ReservationStatus.NO_SHOW,
    ]) {
      const c = make({
        depositId: 'a',
        appliedToReservationId: 'r1',
        appliedToStatus,
      });
      expect(ids(selectAvailableCredits([c]))).toEqual(['a']);
    }
  });

  it('ordena del más antiguo al más reciente', () => {
    const newer = make({
      depositId: 'n',
      confirmedAt: new Date('2026-10-05T10:00:00Z'),
    });
    const older = make({
      depositId: 'o',
      confirmedAt: new Date('2026-10-01T10:00:00Z'),
    });
    expect(ids(selectAvailableCredits([newer, older]))).toEqual(['o', 'n']);
  });
});

describe('effectiveAppliedStatus', () => {
  it('sin reservas devuelve null', () => {
    expect(effectiveAppliedStatus([])).toBeNull();
  });

  it('si todas liberan, devuelve la primera', () => {
    expect(
      effectiveAppliedStatus([
        ReservationStatus.CANCELADA,
        ReservationStatus.NO_SHOW,
      ]),
    ).toBe(ReservationStatus.CANCELADA);
  });

  it('si alguna sigue viva, devuelve esa', () => {
    expect(
      effectiveAppliedStatus([
        ReservationStatus.CANCELADA,
        ReservationStatus.CONFIRMADA,
      ]),
    ).toBe(ReservationStatus.CONFIRMADA);
  });
});
