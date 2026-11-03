export type PaceProfile = 'SEGURO' | 'EQUILIBRADO' | 'RAPIDO';

export interface PaceParams {
  gapSeconds: readonly [number, number];
  batchSize: readonly [number, number];
  batchPauseMinutes: readonly [number, number];
  hourlyCap: number;
}

export interface SendWindow {
  startMinute: number;
  endMinute: number;
}

export const PACE_PROFILES: Readonly<Record<PaceProfile, PaceParams>> = {
  SEGURO: {
    gapSeconds: [45, 150],
    batchSize: [5, 9],
    batchPauseMinutes: [6, 14],
    hourlyCap: 20,
  },
  EQUILIBRADO: {
    gapSeconds: [30, 110],
    batchSize: [6, 12],
    batchPauseMinutes: [4, 10],
    hourlyCap: 30,
  },
  RAPIDO: {
    gapSeconds: [20, 75],
    batchSize: [8, 15],
    batchPauseMinutes: [3, 7],
    hourlyCap: 45,
  },
};

export const HARD_START_MINUTE = 6 * 60;
export const HARD_END_MINUTE = 23 * 60;
export const DEFAULT_SEND_WINDOWS: readonly SendWindow[] = [
  { startMinute: 8 * 60, endMinute: 11 * 60 + 30 },
  { startMinute: 14 * 60, endMinute: 17 * 60 + 30 },
];
export const DEFAULT_MAX_PER_DAY = 90;
export const MAX_PER_DAY_LIMIT = 300;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BOGOTA_OFFSET_MS = 5 * HOUR_MS;
const WINDOW_START_JITTER_MINUTES = 8;
const MAX_PLAN_STEPS = 200_000;

export type Rng = () => number;

export function normalizeWindows(
  windows: readonly SendWindow[] | null | undefined,
): SendWindow[] {
  const clamped = (windows ?? [])
    .map((window) => ({
      startMinute: Math.max(HARD_START_MINUTE, Math.round(window.startMinute)),
      endMinute: Math.min(HARD_END_MINUTE, Math.round(window.endMinute)),
    }))
    .filter((window) => window.endMinute - window.startMinute >= 30)
    .sort((a, b) => a.startMinute - b.startMinute);

  const merged: SendWindow[] = [];
  for (const window of clamped) {
    const last = merged[merged.length - 1];
    if (last && window.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
    } else {
      merged.push({ ...window });
    }
  }
  return merged.length > 0
    ? merged
    : DEFAULT_SEND_WINDOWS.map((w) => ({ ...w }));
}

const localMs = (utcMs: number) => utcMs - BOGOTA_OFFSET_MS;
const dayIndex = (utcMs: number) => Math.floor(localMs(utcMs) / DAY_MS);
const dayStartUtc = (index: number) => index * DAY_MS + BOGOTA_OFFSET_MS;
const minuteOfDay = (utcMs: number) =>
  Math.floor((localMs(utcMs) - dayIndex(utcMs) * DAY_MS) / MINUTE_MS);

const between = (rng: Rng, [min, max]: readonly [number, number]) =>
  min + rng() * (max - min);
const betweenInt = (rng: Rng, range: readonly [number, number]) =>
  Math.round(between(rng, range));

function alignToWindow(
  utcMs: number,
  windows: readonly SendWindow[],
  rng: Rng,
): number {
  const minute = minuteOfDay(utcMs);
  if (
    windows.some(
      (window) => minute >= window.startMinute && minute < window.endMinute,
    )
  ) {
    return utcMs;
  }
  const jitter = Math.floor(rng() * WINDOW_START_JITTER_MINUTES) * MINUTE_MS;
  const today = dayIndex(utcMs);
  const next = windows.find((window) => window.startMinute > minute);
  if (next) {
    return dayStartUtc(today) + next.startMinute * MINUTE_MS + jitter;
  }
  return dayStartUtc(today + 1) + windows[0].startMinute * MINUTE_MS + jitter;
}

export interface PlanScheduleInput {
  count: number;
  start: Date;
  pace: PaceProfile;
  windows?: readonly SendWindow[];
  maxPerDay?: number;
  alreadySentToday?: number;
  rng?: Rng;
}

export function planSchedule(input: PlanScheduleInput): Date[] {
  const params = PACE_PROFILES[input.pace];
  const windows = normalizeWindows(input.windows);
  const maxPerDay = Math.max(1, input.maxPerDay ?? DEFAULT_MAX_PER_DAY);
  const rng = input.rng ?? Math.random;

  const sentPerDay = new Map<number, number>();
  const startDay = dayIndex(input.start.getTime());
  if (input.alreadySentToday) {
    sentPerDay.set(startDay, input.alreadySentToday);
  }

  const recent: number[] = [];
  const times: Date[] = [];
  let cursor = input.start.getTime();
  let inBatch = 0;
  let batchTarget = betweenInt(rng, params.batchSize);
  let steps = 0;

  while (times.length < input.count) {
    for (;;) {
      if (++steps > MAX_PLAN_STEPS) return times;
      cursor = alignToWindow(cursor, windows, rng);
      const day = dayIndex(cursor);
      if ((sentPerDay.get(day) ?? 0) >= maxPerDay) {
        cursor = dayStartUtc(day + 1);
        continue;
      }
      while (recent.length > 0 && cursor - recent[0] >= HOUR_MS) {
        recent.shift();
      }
      if (recent.length >= params.hourlyCap) {
        cursor = recent[0] + HOUR_MS + 1_000;
        continue;
      }
      break;
    }

    times.push(new Date(cursor));
    recent.push(cursor);
    const day = dayIndex(cursor);
    sentPerDay.set(day, (sentPerDay.get(day) ?? 0) + 1);

    inBatch += 1;
    if (inBatch >= batchTarget) {
      cursor += between(rng, params.batchPauseMinutes) * MINUTE_MS;
      inBatch = 0;
      batchTarget = betweenInt(rng, params.batchSize);
    } else {
      cursor += between(rng, params.gapSeconds) * 1_000;
    }
  }
  return times;
}

export interface ScheduleEstimate {
  count: number;
  firstAt: Date | null;
  lastAt: Date | null;
  days: number;
}

export function estimateSchedule(input: PlanScheduleInput): ScheduleEstimate {
  const times = planSchedule(input);
  if (times.length === 0) {
    return { count: 0, firstAt: null, lastAt: null, days: 0 };
  }
  const first = times[0];
  const last = times[times.length - 1];
  return {
    count: times.length,
    firstAt: first,
    lastAt: last,
    days: dayIndex(last.getTime()) - dayIndex(first.getTime()) + 1,
  };
}

export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { minuteOfDay as bogotaMinuteOfDay, dayIndex as bogotaDayIndex };
