import type { WeeklyWindow } from './operating-hours';
import { parseTimeOfDay } from './schedule-time';

export const MAX_WINDOWS_PER_DAY = 4;

export interface WeeklyScheduleDayInput {
  dayOfWeek: number;
  windows: ReadonlyArray<{ startTime: string; endTime: string }>;
}

export type WeeklyScheduleIssue =
  | { kind: 'DUPLICATED_DAY'; dayOfWeek: number }
  | {
      kind: 'INVALID_RANGE';
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }
  | { kind: 'OVERLAP'; dayOfWeek: number }
  | { kind: 'TOO_MANY_WINDOWS'; dayOfWeek: number }
  | { kind: 'EMPTY_WEEK' };

export function normalizeWeeklySchedule(
  days: readonly WeeklyScheduleDayInput[],
): { windows: WeeklyWindow[]; issues: WeeklyScheduleIssue[] } {
  const issues: WeeklyScheduleIssue[] = [];
  const windows: WeeklyWindow[] = [];
  const seen = new Set<number>();

  for (const day of days) {
    if (seen.has(day.dayOfWeek)) {
      issues.push({ kind: 'DUPLICATED_DAY', dayOfWeek: day.dayOfWeek });
      continue;
    }
    seen.add(day.dayOfWeek);

    if (day.windows.length > MAX_WINDOWS_PER_DAY) {
      issues.push({ kind: 'TOO_MANY_WINDOWS', dayOfWeek: day.dayOfWeek });
    }

    const parsed: WeeklyWindow[] = [];
    for (const window of day.windows) {
      const startMinute = parseTimeOfDay(window.startTime);
      const endMinute = parseTimeOfDay(window.endTime);
      if (
        startMinute === null ||
        endMinute === null ||
        startMinute >= endMinute
      ) {
        issues.push({
          kind: 'INVALID_RANGE',
          dayOfWeek: day.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
        });
        continue;
      }
      parsed.push({ dayOfWeek: day.dayOfWeek, startMinute, endMinute });
    }

    parsed.sort((a, b) => a.startMinute - b.startMinute);
    const overlaps = parsed.some(
      (window, index) =>
        index > 0 && window.startMinute < parsed[index - 1].endMinute,
    );
    if (overlaps) issues.push({ kind: 'OVERLAP', dayOfWeek: day.dayOfWeek });

    windows.push(...parsed);
  }

  if (issues.length === 0 && windows.length === 0) {
    issues.push({ kind: 'EMPTY_WEEK' });
  }

  return {
    windows: windows.sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
    ),
    issues,
  };
}

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

export function describeWeeklyScheduleIssue(
  issue: WeeklyScheduleIssue,
): string {
  switch (issue.kind) {
    case 'DUPLICATED_DAY':
      return `El ${DAY_NAMES[issue.dayOfWeek]} aparece más de una vez.`;
    case 'INVALID_RANGE':
      return `El ${DAY_NAMES[issue.dayOfWeek]} tiene una franja inválida (${issue.startTime}–${issue.endTime}).`;
    case 'OVERLAP':
      return `Las franjas del ${DAY_NAMES[issue.dayOfWeek]} se cruzan entre sí.`;
    case 'TOO_MANY_WINDOWS':
      return `El ${DAY_NAMES[issue.dayOfWeek]} admite máximo ${MAX_WINDOWS_PER_DAY} franjas.`;
    case 'EMPTY_WEEK':
      return 'El spa debe abrir al menos una franja en la semana.';
  }
}
