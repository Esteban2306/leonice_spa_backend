import { HairColor, HairDensity, HairLength } from '@prisma/client';
import {
  getHairProfileStatus,
  type HairProfileStatus,
} from '../../clients/domain/hair-profile.util';

interface BotClientSource {
  name: string;
  hairLength: HairLength | null;
  hairColor: HairColor | null;
  hairDensity?: HairDensity | null;
  hairProfileUpdatedAt: Date | null;
  depositExempt?: boolean;
}

export const NEW_CLIENT_INTRO =
  'Desde ahora yo atiendo y gestiono tus citas por aquí; cualquier duda de citas, tratamientos o productos me la puedes escribir 😊';

export interface BotClientView {
  registered: boolean;
  firstContactNotice?: string;
  name?: string;
  firstName?: string;
  termsAccepted?: boolean;
  noDepositNeeded?: true;
  hairProfile?: {
    status: HairProfileStatus;
    hairLength?: HairLength;
    hairColor?: HairColor;
    hairDensity?: HairDensity;
  };
}

const VISIT_DATE = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export interface BotLastVisit {
  date: string;
  treatment: string;
}

export function toBotLastVisit(
  visit: {
    completedAt: Date | null;
    scheduledStart: Date;
    treatment: { name: string };
  } | null,
): BotLastVisit | undefined {
  if (!visit) return undefined;
  return {
    date: VISIT_DATE.format(visit.completedAt ?? visit.scheduledStart),
    treatment: visit.treatment.name,
  };
}

export function toBotClient(
  client: BotClientSource | null,
  termsAccepted: boolean,
  now: Date = new Date(),
): BotClientView {
  if (!client) {
    return { registered: false, firstContactNotice: NEW_CLIENT_INTRO };
  }
  const status = getHairProfileStatus(client, now);
  const name = client.name.trim();
  return {
    registered: true,
    name,
    firstName: name.split(/\s+/)[0],
    termsAccepted,
    ...(client.depositExempt && { noDepositNeeded: true as const }),
    hairProfile:
      status === 'VALID'
        ? {
            status,
            hairLength: client.hairLength!,
            hairColor: client.hairColor!,
            ...(client.hairDensity ? { hairDensity: client.hairDensity } : {}),
          }
        : { status },
  };
}
