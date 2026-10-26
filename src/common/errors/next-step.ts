import type { ErrorCode } from './error-catalog';

/**
 * Qué debería hacer quien consume la API (el bot) cuando recibe este error:
 * - OFFER_OTHER_SLOT: ofrecer otro horario o día.
 * - SHOW_UPCOMING: revisar las citas de la clienta antes de insistir.
 * - ASK_CLIENT_DATA: pedir los datos que faltan.
 * - RETRY_LATER: reintentar más tarde.
 * - HANDOFF: pasar con una persona del equipo.
 */
export type NextStep =
  | 'OFFER_OTHER_SLOT'
  | 'SHOW_UPCOMING'
  | 'ASK_CLIENT_DATA'
  | 'RETRY_LATER'
  | 'HANDOFF';

const NEXT_STEP: Partial<Record<ErrorCode, NextStep>> = {
  PLACEMENT_NO_SLOT_THAT_DAY: 'OFFER_OTHER_SLOT',
  PLACEMENT_NO_CAPACITY: 'OFFER_OTHER_SLOT',
  PLACEMENT_CATEGORY_DAY_CONFLICT: 'OFFER_OTHER_SLOT',
  PLACEMENT_CLIENT_OVERLAP: 'OFFER_OTHER_SLOT',
  PLACEMENT_IN_THE_PAST: 'OFFER_OTHER_SLOT',
  PLACEMENT_OUTSIDE_OPERATING_HOURS: 'OFFER_OTHER_SLOT',
  RESERVATION_RESCHEDULE_SAME_SLOT: 'OFFER_OTHER_SLOT',
  RESERVATION_NOT_OWNED: 'SHOW_UPCOMING',
  RESERVATION_NOT_RESCHEDULABLE: 'SHOW_UPCOMING',
  RESERVATION_NOT_CANCELLABLE: 'SHOW_UPCOMING',
  RESERVATION_CANCEL_TOO_LATE: 'HANDOFF',
  CLIENT_REQUIRED_FIELDS: 'ASK_CLIENT_DATA',
  CLIENT_HEALTH_CONSENT_REQUIRED: 'HANDOFF',
  RATE_LIMITED: 'RETRY_LATER',
  SERVICE_UNAVAILABLE: 'RETRY_LATER',
};

export function nextStepFor(code: ErrorCode): NextStep | undefined {
  return NEXT_STEP[code];
}
