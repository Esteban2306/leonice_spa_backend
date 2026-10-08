import type { TimeWindow } from './operating-hours';

export interface DepositExpiryInput {
  startedAt: Date;
  operatingMs: number;
  notAfter: Date;
  windowsForDay: (day: Date) => readonly TimeWindow[];
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function nextDay(day: Date): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  return next;
}

export function computeDepositExpiry(input: DepositExpiryInput): Date {
  const { startedAt, operatingMs, notAfter, windowsForDay } = input;
  const limit = notAfter.getTime();
  const origin = startedAt.getTime();
  if (origin >= limit) return new Date(limit);

  let remaining = operatingMs;
  for (
    let day = startOfDay(startedAt);
    day.getTime() < limit;
    day = nextDay(day)
  ) {
    for (const window of windowsForDay(day)) {
      const from = Math.max(window.start.getTime(), origin);
      const until = Math.min(window.end.getTime(), limit);
      if (until <= from) continue;
      if (until - from >= remaining) return new Date(from + remaining);
      remaining -= until - from;
    }
  }
  return new Date(limit);
}
