export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface WeeklyWindow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export type ScheduleExceptionKind = 'BLOCK' | 'OPEN';

export interface DayException {
  type: ScheduleExceptionKind;
  categoryId: string | null;
  startMinute: number | null;
  endMinute: number | null;
}

export interface DaySchedule {
  base: readonly WeeklyWindow[];
  exceptions: readonly DayException[];
}

export type MinuteRange = readonly [number, number];

export const MINUTES_PER_DAY = 24 * 60;

export const DEFAULT_WEEKLY_WINDOWS: readonly WeeklyWindow[] = [
  ...[1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { dayOfWeek, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek, startMinute: 14 * 60, endMinute: 16 * 60 },
  ]),
  ...[0, 6].flatMap((dayOfWeek) => [
    { dayOfWeek, startMinute: 7 * 60, endMinute: 12 * 60 },
    { dayOfWeek, startMinute: 14 * 60, endMinute: 16 * 60 },
  ]),
];

export function mergeMinuteRanges(
  ranges: readonly MinuteRange[],
): MinuteRange[] {
  const sorted = ranges
    .filter(([start, end]) => end > start)
    .map(([start, end]) => [start, end] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

export function subtractMinuteRanges(
  ranges: readonly MinuteRange[],
  cuts: readonly MinuteRange[],
): MinuteRange[] {
  let remaining: MinuteRange[] = mergeMinuteRanges(ranges);
  for (const [cutStart, cutEnd] of mergeMinuteRanges(cuts)) {
    remaining = remaining.flatMap(([start, end]): MinuteRange[] => {
      if (cutEnd <= start || cutStart >= end) return [[start, end]];
      const pieces: MinuteRange[] = [];
      if (cutStart > start) pieces.push([start, cutStart]);
      if (cutEnd < end) pieces.push([cutEnd, end]);
      return pieces;
    });
  }
  return remaining;
}

export function exceptionAppliesTo(
  exception: Pick<DayException, 'categoryId'>,
  categoryId?: string,
): boolean {
  return exception.categoryId === null || exception.categoryId === categoryId;
}

function exceptionRange(exception: DayException): MinuteRange {
  return exception.startMinute === null || exception.endMinute === null
    ? [0, MINUTES_PER_DAY]
    : [exception.startMinute, exception.endMinute];
}

export function resolveDayMinuteRanges(
  dayOfWeek: number,
  schedule: DaySchedule,
  categoryId?: string,
): MinuteRange[] {
  const applicable = schedule.exceptions.filter((e) =>
    exceptionAppliesTo(e, categoryId),
  );
  const base = schedule.base
    .filter((w) => w.dayOfWeek === dayOfWeek)
    .map((w): MinuteRange => [w.startMinute, w.endMinute]);
  const opened = applicable
    .filter((e) => e.type === 'OPEN')
    .map(exceptionRange);
  const blocked = applicable
    .filter((e) => e.type === 'BLOCK')
    .map(exceptionRange);

  return subtractMinuteRanges([...base, ...opened], blocked);
}

export function minuteToDate(date: Date, minute: number): Date {
  const result = new Date(date);
  result.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return result;
}

export function getOperatingWindowsForDate(
  date: Date,
  schedule: DaySchedule,
  categoryId?: string,
): TimeWindow[] {
  return resolveDayMinuteRanges(date.getDay(), schedule, categoryId).map(
    ([start, end]) => ({
      start: minuteToDate(date, start),
      end: minuteToDate(date, end),
    }),
  );
}

export function findIntervalsOutsideWindows<
  T extends { scheduledStart: Date; scheduledEnd: Date },
>(intervals: readonly T[], windows: readonly TimeWindow[]): T[] {
  return intervals.filter(
    (interval) =>
      !windows.some(
        (w) =>
          interval.scheduledStart.getTime() >= w.start.getTime() &&
          interval.scheduledEnd.getTime() <= w.end.getTime(),
      ),
  );
}
