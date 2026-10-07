import { CancellationSource, ReservationStatus } from '@prisma/client';
import {
  ReviveCandidate,
  selectReservationsToRevive,
} from './select-reservations-to-revive';

const make = (
  overrides: Partial<ReviveCandidate> & { id: string },
): ReviveCandidate => ({
  status: ReservationStatus.CANCELADA,
  cancellationSource: CancellationSource.TIMEOUT,
  comboGroupId: null,
  ...overrides,
});

describe('selectReservationsToRevive', () => {
  it('revive una reserva suelta cancelada por timeout', () => {
    const target = make({ id: 'a' });
    expect(selectReservationsToRevive(target, [target])).toEqual({
      ok: true,
      reservations: [target],
    });
  });

  it('rechaza una cancelada por el admin', () => {
    const target = make({
      id: 'a',
      cancellationSource: CancellationSource.ADMIN,
    });
    expect(selectReservationsToRevive(target, [target])).toEqual({
      ok: false,
      reason: 'NOT_REVIVABLE',
    });
  });

  it('rechaza una cancelada sin origen (cancelaciones previas o de cliente)', () => {
    const target = make({ id: 'a', cancellationSource: null });
    expect(selectReservationsToRevive(target, [target])).toEqual({
      ok: false,
      reason: 'NOT_REVIVABLE',
    });
  });

  it('rechaza una reserva que no está cancelada', () => {
    const target = make({ id: 'a', status: ReservationStatus.CONFIRMADA });
    expect(selectReservationsToRevive(target, [target])).toEqual({
      ok: false,
      reason: 'NOT_REVIVABLE',
    });
  });

  it('revive todo el combo si todas las filas expiraron por timeout', () => {
    const a = make({ id: 'a', comboGroupId: 'c1' });
    const b = make({ id: 'b', comboGroupId: 'c1' });
    expect(selectReservationsToRevive(a, [a, b])).toEqual({
      ok: true,
      reservations: [a, b],
    });
  });

  it('rechaza el combo si una fila ya fue aprobada', () => {
    const a = make({ id: 'a', comboGroupId: 'c1' });
    const b = make({
      id: 'b',
      comboGroupId: 'c1',
      status: ReservationStatus.CONFIRMADA,
      cancellationSource: null,
    });
    expect(selectReservationsToRevive(a, [a, b])).toEqual({
      ok: false,
      reason: 'COMBO_NOT_REVIVABLE',
    });
  });

  it('rechaza el combo si una fila fue cancelada por el admin', () => {
    const a = make({ id: 'a', comboGroupId: 'c1' });
    const b = make({
      id: 'b',
      comboGroupId: 'c1',
      cancellationSource: CancellationSource.ADMIN,
    });
    expect(selectReservationsToRevive(a, [a, b])).toEqual({
      ok: false,
      reason: 'COMBO_NOT_REVIVABLE',
    });
  });

  it('si el combo llega sin miembros, usa solo el objetivo', () => {
    const a = make({ id: 'a', comboGroupId: 'c1' });
    expect(selectReservationsToRevive(a, [])).toEqual({
      ok: true,
      reservations: [a],
    });
  });
});
