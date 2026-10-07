import {
  CancellationSource,
  Reservation,
  ReservationStatus,
} from '@prisma/client';

export type ReviveCandidate = Pick<
  Reservation,
  'id' | 'status' | 'cancellationSource' | 'comboGroupId'
>;

export type ReviveSelection<T extends ReviveCandidate> =
  | { ok: true; reservations: T[] }
  | { ok: false; reason: 'NOT_REVIVABLE' | 'COMBO_NOT_REVIVABLE' };

export function isRevivable(
  reservation: Pick<ReviveCandidate, 'status' | 'cancellationSource'>,
): boolean {
  return (
    reservation.status === ReservationStatus.CANCELADA &&
    reservation.cancellationSource === CancellationSource.TIMEOUT
  );
}

export function selectReservationsToRevive<T extends ReviveCandidate>(
  target: T,
  comboMembers: readonly T[],
): ReviveSelection<T> {
  if (!isRevivable(target)) {
    return { ok: false, reason: 'NOT_REVIVABLE' };
  }

  if (target.comboGroupId === null) {
    return { ok: true, reservations: [target] };
  }

  const members = comboMembers.length === 0 ? [target] : [...comboMembers];

  if (!members.every(isRevivable)) {
    return { ok: false, reason: 'COMBO_NOT_REVIVABLE' };
  }

  return { ok: true, reservations: members };
}
