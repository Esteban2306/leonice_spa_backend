import { Client, HairColor, HairLength } from '@prisma/client';
import { HAIR_PROFILE_VALID_MONTHS } from './hair-profile.constants';

export type HairProfileStatus = 'MISSING' | 'EXPIRED' | 'VALID';

export type HairProfileFields = Pick<
  Client,
  'hairLength' | 'hairColor' | 'hairProfileUpdatedAt'
>;

export interface HairProfileView {
  hairLength: HairLength | null;
  hairColor: HairColor | null;
  updatedAt: Date | null;
  validUntil: Date | null;
  status: HairProfileStatus;
}

export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

export function hairProfileValidUntil(updatedAt: Date): Date {
  return addCalendarMonths(updatedAt, HAIR_PROFILE_VALID_MONTHS);
}

export function hairProfileExpiryCutoff(now: Date): Date {
  return addCalendarMonths(now, -HAIR_PROFILE_VALID_MONTHS);
}

export function getHairProfileStatus(
  client: HairProfileFields,
  now: Date = new Date(),
): HairProfileStatus {
  if (!client.hairLength || !client.hairColor || !client.hairProfileUpdatedAt) {
    return 'MISSING';
  }
  return hairProfileValidUntil(client.hairProfileUpdatedAt) > now
    ? 'VALID'
    : 'EXPIRED';
}

export function isHairProfileValid(
  client: HairProfileFields,
  now: Date = new Date(),
): boolean {
  return getHairProfileStatus(client, now) === 'VALID';
}

export function toHairProfileView(
  client: HairProfileFields,
  now: Date = new Date(),
): HairProfileView {
  const status = getHairProfileStatus(client, now);
  return {
    hairLength: client.hairLength,
    hairColor: client.hairColor,
    updatedAt: client.hairProfileUpdatedAt,
    validUntil:
      status === 'MISSING' || !client.hairProfileUpdatedAt
        ? null
        : hairProfileValidUntil(client.hairProfileUpdatedAt),
    status,
  };
}
