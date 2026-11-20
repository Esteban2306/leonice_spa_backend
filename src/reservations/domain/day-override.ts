import type { DayOverride, MinuteRange } from './operating-hours';
import { formatTimeOfDay, parseTimeOfDay } from './schedule-time';

export const MAX_OVERRIDE_RANGE_DAYS = 62;

export type DayOverrideIssue =
  | { code: 'INVALID_WINDOW'; startTime: string; endTime: string }
  | { code: 'OVERLAPPING_WINDOWS' }
  | { code: 'START_OUTSIDE_WINDOWS'; startTime: string }
  | { code: 'INVALID_START'; startTime: string };

export function buildDayOverride(
  windows: ReadonlyArray<{ startTime: string; endTime: string }>,
  startTimes: readonly string[] = [],
): { override: DayOverride; issues: DayOverrideIssue[] } {
  const issues: DayOverrideIssue[] = [];
  const ranges: MinuteRange[] = [];
  for (const window of windows) {
    const start = parseTimeOfDay(window.startTime);
    const end = parseTimeOfDay(window.endTime);
    if (start === null || end === null || start >= end) {
      issues.push({ code: 'INVALID_WINDOW', ...window });
      continue;
    }
    ranges.push([start, end]);
  }
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  if (sorted.some((range, i) => i > 0 && range[0] < sorted[i - 1][1])) {
    issues.push({ code: 'OVERLAPPING_WINDOWS' });
  }

  const startMinutes: number[] = [];
  for (const startTime of startTimes) {
    const minute = parseTimeOfDay(startTime);
    if (minute === null) {
      issues.push({ code: 'INVALID_START', startTime });
      continue;
    }
    if (!sorted.some(([start, end]) => minute >= start && minute < end)) {
      issues.push({ code: 'START_OUTSIDE_WINDOWS', startTime });
      continue;
    }
    startMinutes.push(minute);
  }

  return {
    override: {
      windows: sorted,
      startMinutes: [...new Set(startMinutes)].sort((a, b) => a - b),
    },
    issues,
  };
}

export function describeDayOverrideIssue(issue: DayOverrideIssue): string {
  switch (issue.code) {
    case 'INVALID_WINDOW':
      return `La franja ${issue.startTime}–${issue.endTime} no es válida: el inicio debe ser antes del fin.`;
    case 'OVERLAPPING_WINDOWS':
      return 'Las franjas no pueden cruzarse entre sí.';
    case 'START_OUTSIDE_WINDOWS':
      return `La hora de inicio ${issue.startTime} queda fuera de las franjas abiertas.`;
    case 'INVALID_START':
      return `La hora de inicio ${issue.startTime} no es válida.`;
  }
}

export function dayKeysBetween(fromDayKey: string, toDayKey: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${fromDayKey}T00:00:00.000Z`);
  const end = new Date(`${toDayKey}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function toOverrideView(override: {
  dayKey: string;
  windows: readonly MinuteRange[];
  startMinutes: readonly number[];
  reason: string | null;
}) {
  return {
    date: override.dayKey,
    isClosed: override.windows.length === 0,
    windows: override.windows.map(([start, end]) => ({
      startTime: formatTimeOfDay(start),
      endTime: formatTimeOfDay(end),
    })),
    startTimes: override.startMinutes.map(formatTimeOfDay),
    reason: override.reason,
  };
}
