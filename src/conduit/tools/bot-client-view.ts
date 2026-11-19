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
}

export const NEW_CLIENT_INTRO =
  'Desde ahora yo atiendo y gestiono tus citas por aquí; cualquier duda de citas, tratamientos o productos me la puedes escribir 😊';

export interface BotClientView {
  registered: boolean;
  firstContactNotice?: string;
  name?: string;
  firstName?: string;
  termsAccepted?: boolean;
  hairProfile?: {
    status: HairProfileStatus;
    hairLength?: HairLength;
    hairColor?: HairColor;
    hairDensity?: HairDensity;
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
