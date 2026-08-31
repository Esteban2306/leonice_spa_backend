import { Reservation } from '@prisma/client';
import { getOperatingWindowsForDate } from './operating-hours';

type ReservationWithRelations = Reservation & {
  client: { id: string; name: string; phone: string };
  treatment: { id: string; name: string };
  category: { id: string; name: string };
};

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
  }>;
}

export function isEffectivelyConsecutive(
  cursorEnd: Date,
  candidateStart: Date,
): boolean {
  if (cursorEnd.getTime() === candidateStart.getTime()) return true;
  if (candidateStart.getTime() < cursorEnd.getTime()) return false;

  if (cursorEnd.toDateString() !== candidateStart.toDateString()) return false;

  const windowsThatDay = getOperatingWindowsForDate(cursorEnd);
  const hasOpenTimeInGap = windowsThatDay.some(
    (w) =>
      w.start.getTime() < candidateStart.getTime() &&
      w.end.getTime() > cursorEnd.getTime(),
  );

  return !hasOpenTimeInGap;
}

export function groupReservationsForDisplay(
  reservations: ReservationWithRelations[],
): GroupedReservation[] {
  const byComboGroupId = new Map<string, ReservationWithRelations[]>();

  const ungrouped: ReservationWithRelations[] = [];

  for (const r of reservations) {
    if (r.comboGroupId) {
      const bucket = byComboGroupId.get(r.comboGroupId) ?? [];
      bucket.push(r);
      byComboGroupId.set(r.comboGroupId, bucket);
    } else {
      ungrouped.push(r);
    }
  }

  const groups: ReservationWithRelations[][] = [...byComboGroupId.values()];

  const sortedUngrouped = [...ungrouped].sort(
    (a, b) =>
      a.clientId.localeCompare(b.clientId) ||
      a.scheduledStart.getTime() - b.scheduledStart.getTime(),
  );

  const consumed = new Set<string>();

  for (const r of sortedUngrouped) {
    if (consumed.has(r.id)) continue;

    const chain = [r];
    consumed.add(r.id);

    let cursor = r;

    for (const candidate of sortedUngrouped) {
      if (consumed.has(candidate.id)) continue;
      if (candidate.clientId !== cursor.clientId) continue;
      if (
        isEffectivelyConsecutive(cursor.scheduledEnd, candidate.scheduledStart)
      ) {
        chain.push(candidate);
        consumed.add(candidate.id);
        cursor = candidate;
      }
    }
    groups.push(chain);
  }

  return groups.map((group) => ({
    isCombo: group.length > 1,
    comboGroupId: group[0].comboGroupId,
    client: group[0].client,
    items: group
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
      .map((r) => ({
        reservationId: r.id,
        treatment: r.treatment,
        category: r.category,
        status: r.status,
        scheduledStart: r.scheduledStart,
        scheduledEnd: r.scheduledEnd,
        finalPrice: r.finalPrice.toString(),
      })),
  }));
}
