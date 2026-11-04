import { bogotaMinuteOfDay } from '../../campaigns/domain/pacing';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

export const FOLLOW_UP_START_MINUTE = 9 * 60;
export const FOLLOW_UP_END_MINUTE = 18 * 60;

export function alignToDaytime(
  at: Date,
  startMinute: number = FOLLOW_UP_START_MINUTE,
  endMinute: number = FOLLOW_UP_END_MINUTE,
): Date {
  const minute = bogotaMinuteOfDay(at.getTime());
  if (minute >= startMinute && minute < endMinute) return at;
  const wait =
    minute < startMinute
      ? startMinute - minute
      : DAY_MINUTES - minute + startMinute;
  return new Date(at.getTime() + wait * MINUTE_MS);
}
