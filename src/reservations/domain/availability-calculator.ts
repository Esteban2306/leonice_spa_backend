import { AvailableSlotsType } from '../types/disponivility.types';
import { minuteToDate } from './operating-hours';

export interface HeldInterval {
  scheduledStart: Date;
  scheduledEnd: Date;
  personKey?: string;
}

export function maxConcurrentInWindow(
  held: HeldInterval[],
  windowStart: Date,
  windowEnd: Date,
) {
  const criticalPoints = new Set<number>([windowStart.getTime()]);
  for (const interval of held) {
    const t = interval.scheduledStart.getTime();
    if (t >= windowStart.getTime() && t < windowEnd.getTime()) {
      criticalPoints.add(t);
    }
  }

  let max = 0;

  for (const point of criticalPoints) {
    const active = held.filter(
      (i) =>
        i.scheduledStart.getTime() <= point && i.scheduledEnd.getTime() > point,
    );
    const people = new Set(active.map((i) => i.personKey ?? i));
    max = Math.max(max, people.size);
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
    startMinutes,
  } = params;
  const slots: Date[] = [];

  if (startMinutes && startMinutes.length > 0) {
    for (const window of operatingWindows) {
      for (const minute of startMinutes) {
        const candidate = minuteToDate(window.start, minute);
        const candidateEnd = new Date(
          candidate.getTime() + durationMinutes * 60_000,
        );
        if (
          candidate.getTime() < window.start.getTime() ||
          candidateEnd.getTime() > window.end.getTime()
        ) {
          continue;
        }
        if (maxConcurrentInWindow(held, candidate, candidateEnd) < capacity) {
          slots.push(candidate);
        }
      }
    }
    return slots.sort((a, b) => a.getTime() - b.getTime());
  }

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
