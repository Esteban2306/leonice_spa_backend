export const ANONYMIZED_NAME = 'Cliente anonimizado';
export const ANONYMIZED_BIRTH_DATE = new Date('1900-01-01T00:00:00.000Z');
export const ANONYMIZED_PHONE_PREFIX = 'anonimizado-';

export function anonymizedPhone(clientId: string): string {
  return `${ANONYMIZED_PHONE_PREFIX}${clientId}`;
}

export function isAnonymizedPhone(phone: string): boolean {
  return phone.startsWith(ANONYMIZED_PHONE_PREFIX);
}
