import { DepositStatus, ReservationStatus } from '@prisma/client';

export const CREDIT_ORIGIN_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.CANCELADA,
  ReservationStatus.NO_SHOW,
];

export const CREDIT_RELEASING_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.CANCELADA,
  ReservationStatus.NO_SHOW,
];

export interface CreditCandidate {
  depositId: string;
  originReservationId: string;
  amount: number | null;
  status: DepositStatus;
  hasProofImage: boolean;
  originStatus: ReservationStatus;
  coveredStatuses: readonly ReservationStatus[];
  appliedToReservationId: string | null;
  appliedToStatus: ReservationStatus | null;
  confirmedAt: Date;
}

export function isCreditAvailable(candidate: CreditCandidate): boolean {
  if (candidate.status !== DepositStatus.CONFIRMADO) return false;
  if (!candidate.hasProofImage) return false;
  if (candidate.amount === null) return false;
  if (!CREDIT_ORIGIN_STATUSES.includes(candidate.originStatus)) return false;
  if (
    !candidate.coveredStatuses.every((s) => CREDIT_ORIGIN_STATUSES.includes(s))
  )
    return false;

  if (candidate.appliedToReservationId === null) return true;
  return (
    candidate.appliedToStatus !== null &&
    CREDIT_RELEASING_STATUSES.includes(candidate.appliedToStatus)
  );
}

export function selectAvailableCredits(
  candidates: readonly CreditCandidate[],
): CreditCandidate[] {
  return candidates
    .filter((c) => isCreditAvailable(c))
    .sort(
      (a, b) =>
        a.confirmedAt.getTime() - b.confirmedAt.getTime() ||
        a.depositId.localeCompare(b.depositId),
    );
}

export function effectiveAppliedStatus(
  statuses: readonly ReservationStatus[],
): ReservationStatus | null {
  if (statuses.length === 0) return null;
  return (
    statuses.find((s) => !CREDIT_RELEASING_STATUSES.includes(s)) ?? statuses[0]
  );
}
