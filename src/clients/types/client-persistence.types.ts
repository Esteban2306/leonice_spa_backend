import { HairColor, HairLength } from '@prisma/client';

export interface CreateClientData {
  phone: string;
  name: string;
  birthDate: Date;
  whatsappJid?: string;
  allergies?: string;
  isPregnant?: boolean;
  hairLength?: HairLength;
  hairColor?: HairColor;
}

export interface UpdateClientData {
  name?: string;
  birthDate?: Date;
  allergies?: string;
  isPregnant?: boolean;
  hairLength?: HairLength;
  hairColor?: HairColor;
}
