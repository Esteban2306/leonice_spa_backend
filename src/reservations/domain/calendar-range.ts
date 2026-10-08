import { AppException } from '../../common/errors/app.exception';
import { getDayBoundaries } from './day-boundaries';

export interface CalendarRangeInput {
  date?: string;
  from?: string;
  to?: string;
}

export interface CalendarRange {
  dayStart?: Date;
  dayEnd?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnight(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00`);
}

export function resolveCalendarRange(
  input: CalendarRangeInput,
  maxDays?: number,
): CalendarRange {
  if (input.date) {
    return getDayBoundaries(localMidnight(input.date));
  }

  const dayStart = input.from
    ? getDayBoundaries(localMidnight(input.from)).dayStart
    : undefined;
  const dayEnd = input.to
    ? getDayBoundaries(localMidnight(input.to)).dayEnd
    : undefined;

  if (dayStart && dayEnd && dayStart.getTime() >= dayEnd.getTime()) {
    throw new AppException('DATE_RANGE_INVALID', {
      message: 'La fecha inicial debe ser anterior o igual a la final.',
      details: { from: input.from, to: input.to },
    });
  }

  if (maxDays !== undefined) {
    if (!dayStart || !dayEnd) {
      throw new AppException('DATE_RANGE_INVALID', {
        message: 'Indica date, o from y to.',
      });
    }
    const days = Math.round((dayEnd.getTime() - dayStart.getTime()) / DAY_MS);
    if (days > maxDays) {
      throw new AppException('DATE_RANGE_INVALID', {
        message: `El rango no puede superar ${maxDays} días.`,
        details: { from: input.from, to: input.to, maxDays },
      });
    }
  }

  return { dayStart, dayEnd };
}
