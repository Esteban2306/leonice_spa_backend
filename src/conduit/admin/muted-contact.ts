import { normalizePhone } from '../../clients/utils/normalize-phone.util';

export const DEFAULT_MUTE_REASON =
  'Bot u otra empresa: el asistente nunca responde';

const LID_ADDRESS = /^\d{5,25}@lid$/;
const E164_DIGITS = /^[1-9]\d{9,14}$/;

export function mutedContactAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (LID_ADDRESS.test(trimmed)) return trimmed;
  const digits = normalizePhone(trimmed).replace(/^\+/, '');
  return E164_DIGITS.test(digits) ? digits : null;
}
