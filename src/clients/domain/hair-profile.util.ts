import { Client } from '@prisma/client';
import { HAIR_PROFILE_VALID_MONTHS } from './hair-profile.constants';

export function isHairProfileValid(
  client: Pick<Client, 'hairLength' | 'hairColor' | 'hairProfileUpdatedAt'>,
): boolean {
  if (!client.hairLength || !client.hairColor || !client.hairProfileUpdatedAt)
    return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - HAIR_PROFILE_VALID_MONTHS);
  return client.hairProfileUpdatedAt >= cutoff;
}
