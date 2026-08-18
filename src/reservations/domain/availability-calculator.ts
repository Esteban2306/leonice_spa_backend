import { AvailableSlotsType } from '../types/disponivility.types';

export interface HeldInterval {
  scheduledStart: Date;
  scheduledEnd: Date;
}

export function maxConcurrentInWindow(
  held: HeldInterval[],
  windowStart: Date,
  windowEnd: Date,
) {
  const criticalPoints = new Set<number>([windowStart.getTime()]);
  for (const interval of held) {
    const t = interval.scheduledStart.getTime();
    if (t >= windowStart.getTime() && t <= windowEnd.getTime()) {
      criticalPoints.add(t);
    }
  }

  let max = 0;

  for (const point of criticalPoints) {
    const activateCount = held.filter(
      (i) =>
        i.scheduledStart.getTime() <= point && i.scheduledEnd.getTime() > point,
    ).length;
    max = Math.max(max, activateCount);
  }
  return max;
}

export function generateAvailableSlots(params: AvailableSlotsType): Date[] {
  const {
    operatingWindows,
    held,
    durationMinutes,
    capacity,
    stepMinutes = 15,
  } = params;
  const slots: Date[] = [];

  for (const window of operatingWindows) {
    let candidate = new Date(window.start);

    while (true) {
      const candidateEnd = new Date(
        candidate.getTime() + durationMinutes * 60_000,
      );
      if (candidateEnd.getTime() > window.end.getTime()) break;

      const concurrent = maxConcurrentInWindow(held, candidate, candidateEnd);
      if (concurrent < capacity) {
        slots.push(new Date(candidate));
      }

      candidate = new Date(candidate.getTime() + stepMinutes * 60_000);
    }
  }

  return slots;
}
