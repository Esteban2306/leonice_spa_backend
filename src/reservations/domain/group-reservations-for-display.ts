import {
  CancellationSource,
  DepositCoverage,
  DepositRecord,
  DepositStatus,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { getCalendarDayKey } from './calendar-day-key';

export type ReservationWithRelations = Reservation & {
  client: { id: string; name: string; phone: string };
  treatment: { id: string; name: string };
  category: { id: string; name: string };
  deposit: DepositRecord[];
  depositExpiresAt: Date | null;
  appliedDeposits?: Array<Pick<DepositRecord, 'id' | 'amount'>>;
};

export interface LatestDepositSummary {
  status: DepositStatus;
  coverage: DepositCoverage | null;
  imageUrl: string | null;
  amount: string | null;
}

export interface AppliedCreditSummary {
  depositId: string;
  amount: string | null;
  viaCombo: boolean;
}

export interface GroupedReservation {
  isCombo: boolean;
  comboGroupId: string | null;
  client: ReservationWithRelations['client'];
  items: Array<{
    reservationId: string;
    treatment: ReservationWithRelations['treatment'];
    category: ReservationWithRelations['category'];
    status: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    finalPrice: string;
    latestDeposit: LatestDepositSummary | null;
    hasUnresolvedDeposit: boolean;
    isProofUnderReview: boolean;
    depositExpiresAt: Date | null;
    appliedCredit: AppliedCreditSummary | null;
    coveredByDepositId: string | null;
    cancellationSource: CancellationSource | null;
    cancellationReason: string | null;
    cancelledAt: Date | null;
    checkedInAt: Date | null;
  }>;
}

export interface ReservationGroupingRow {
  id: string;
  clientId: string;
  status: ReservationStatus;
  scheduledStart: Date;
  deposit: Array<Pick<DepositRecord, 'status'>>;
}

export interface ReservationGroupsPage {
  reservationIds: string[];
  total: number;
  totalPages: number;
}

type CreditRef = Pick<AppliedCreditSummary, 'depositId' | 'amount'>;

function getReservationGroupKey(r: {
  clientId: string;
  scheduledStart: Date;
}): string {
  return `${r.clientId}:${getCalendarDayKey(r.scheduledStart)}`;
}

export function toLatestDepositSummary(
  deposits: DepositRecord[],
): LatestDepositSummary | null {
  const [latest] = deposits;
  return latest
    ? {
        status: latest.status,
        coverage: latest.coverage,
        imageUrl: latest.imageUrl,
        amount: latest.amount?.toString() ?? null,
      }
    : null;
}

function toOwnCredit(r: ReservationWithRelations): CreditRef | null {
  const credit = r.appliedDeposits?.[0];
  return credit
    ? { depositId: credit.id, amount: credit.amount?.toString() ?? null }
    : null;
}

function resolveAppliedCredit(
  r: ReservationWithRelations,
  creditByCombo: Map<string, CreditRef>,
): AppliedCreditSummary | null {
  const own = toOwnCredit(r);
  if (own) return { ...own, viaCombo: false };
  if (r.comboGroupId === null) return null;

  const shared = creditByCombo.get(r.comboGroupId);
  return shared ? { ...shared, viaCombo: true } : null;
}

export function computeHasUnresolvedDeposit(
  status: ReservationStatus,
  deposits: Array<Pick<DepositRecord, 'status'>>,
): boolean {
  const [latest] = deposits;
  if (!latest) return false;
  const reservationDidNotHappen =
    status === ReservationStatus.NO_SHOW ||
    status === ReservationStatus.CANCELADA;
  const moneyWasAccepted = latest.status === DepositStatus.CONFIRMADO;
  return reservationDidNotHappen && moneyWasAccepted;
}

export function isProofUnderReview(
  status: ReservationStatus,
  deposits: Array<Pick<DepositRecord, 'status' | 'imageUrl'>>,
): boolean {
  const [latest] = deposits;
  return (
    status === ReservationStatus.PENDIENTE_DEPOSITO &&
    latest !== undefined &&
    latest.status === DepositStatus.PENDIENTE &&
    latest.imageUrl !== null
  );
}

export function paginateReservationGroups(
  rows: ReservationGroupingRow[],
  pagination: { page: number; pageSize: number },
  options: { onlyUnresolvedDeposit: boolean },
): ReservationGroupsPage {
  const candidates = options.onlyUnresolvedDeposit
    ? rows.filter((r) => computeHasUnresolvedDeposit(r.status, r.deposit))
    : rows;

  const groups = new Map<string, string[]>();

  for (const r of candidates) {
    const key = getReservationGroupKey(r);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(r.id);
    } else {
      groups.set(key, [r.id]);
    }
  }

  const allGroups = [...groups.values()];
  const start = (pagination.page - 1) * pagination.pageSize;

  return {
    reservationIds: allGroups.slice(start, start + pagination.pageSize).flat(),
    total: allGroups.length,
    totalPages: Math.ceil(allGroups.length / pagination.pageSize),
  };
}

export function groupReservationsForDisplay(
  reservations: ReservationWithRelations[],
): GroupedReservation[] {
  const sorted = [...reservations].sort(
    (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime(),
  );

  const groups = new Map<string, ReservationWithRelations[]>();

  for (const r of sorted) {
    const key = getReservationGroupKey(r);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  return [...groups.values()].map((group) => {
    const creditByCombo = new Map<string, CreditRef>();
    for (const r of group) {
      const own = toOwnCredit(r);
      if (own && r.comboGroupId !== null)
        creditByCombo.set(r.comboGroupId, own);
    }

    return {
      isCombo: group.length > 1,
      comboGroupId: group[0].comboGroupId,
      client: group[0].client,
      items: group.map((r) => ({
        reservationId: r.id,
        treatment: r.treatment,
        category: r.category,
        status: r.status,
        scheduledStart: r.scheduledStart,
        scheduledEnd: r.scheduledEnd,
        finalPrice: r.finalPrice.toString(),
        latestDeposit: toLatestDepositSummary(r.deposit),
        hasUnresolvedDeposit: computeHasUnresolvedDeposit(r.status, r.deposit),
        isProofUnderReview: isProofUnderReview(r.status, r.deposit),
        depositExpiresAt: r.depositExpiresAt,
        appliedCredit: resolveAppliedCredit(r, creditByCombo),
        coveredByDepositId: r.coveredByDepositId,
        cancellationSource: r.cancellationSource,
        cancellationReason: r.cancellationReason,
        cancelledAt: r.cancelledAt,
        checkedInAt: r.checkedInAt,
      })),
    };
  });
}
