import { ERROR_CATALOG, type ErrorCode } from './error-catalog';
import { nextStepFor } from './next-step';

describe('nextStepFor', () => {
  it.each([
    ['PLACEMENT_NO_SLOT_THAT_DAY', 'OFFER_OTHER_SLOT'],
    ['PLACEMENT_NO_CAPACITY', 'OFFER_OTHER_SLOT'],
    ['RESERVATION_NOT_OWNED', 'SHOW_UPCOMING'],
    ['CLIENT_REQUIRED_FIELDS', 'ASK_CLIENT_DATA'],
    ['CLIENT_HEALTH_CONSENT_REQUIRED', 'HANDOFF'],
    ['RESERVATION_CANCEL_TOO_LATE', 'HANDOFF'],
  ] as Array<[ErrorCode, string]>)('%s → %s', (code, step) => {
    expect(nextStepFor(code)).toBe(step);
  });

  it('los códigos sin sugerencia no inventan una', () => {
    expect(nextStepFor('VALIDATION_FAILED')).toBeUndefined();
  });

  it('todos los códigos con sugerencia existen en el catálogo', () => {
    for (const code of Object.keys(ERROR_CATALOG) as ErrorCode[]) {
      const step = nextStepFor(code);
      if (step) expect(ERROR_CATALOG[code]).toBeDefined();
    }
  });
});
