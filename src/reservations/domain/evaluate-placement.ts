import { HeldInterval, maxConcurrentInWindow } from './availability-calculator';
import type { TimeWindow } from './operating-hours';

export type PlacementRejection =
  | 'INVALID_RANGE'
  | 'IN_THE_PAST'
  | 'OUTSIDE_OPERATING_HOURS'
  | 'DUPLICATE_BOOKING'
  | 'NO_CAPACITY';

export type PlacementDecision =
  { ok: true } | { ok: false; reason: PlacementRejection };

export interface PlacementInput {
  start: Date;
  end: Date;
  now: Date;
  operatingWindows: TimeWindow[];
  held: HeldInterval[];
  capacity: number;
  hasDuplicateBooking: boolean;
}

const reject = (reason: PlacementRejection): PlacementDecision => ({
  ok: false,
  reason,
});

export function evaluatePlacement(input: PlacementInput): PlacementDecision {
  const {
    start,
    end,
    now,
    operatingWindows,
    held,
    capacity,
    hasDuplicateBooking,
  } = input;

  if (end.getTime() <= start.getTime()) return reject('INVALID_RANGE');
  if (start.getTime() <= now.getTime()) return reject('IN_THE_PAST');

  const fitsInOneWindow = operatingWindows.some(
    (w) =>
      start.getTime() >= w.start.getTime() && end.getTime() <= w.end.getTime(),
  );
  if (!fitsInOneWindow) return reject('OUTSIDE_OPERATING_HOURS');

  if (hasDuplicateBooking) return reject('DUPLICATE_BOOKING');

  if (maxConcurrentInWindow(held, start, end) >= capacity) {
    return reject('NO_CAPACITY');
  }

  return { ok: true };
}
