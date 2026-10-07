import { DomainException } from '../../common/exceptions/domain.exception';

export const REVIVE_ERROR_CODES = {
  NOT_REVIVABLE: 'RESERVATION_NOT_REVIVABLE',
  COMBO_NOT_REVIVABLE: 'RESERVATION_COMBO_NOT_REVIVABLE',
  SLOT_IN_PAST: 'RESERVATION_REVIVE_SLOT_IN_PAST',
  OUTSIDE_OPERATING_HOURS: 'RESERVATION_REVIVE_OUTSIDE_OPERATING_HOURS',
  NO_CAPACITY: 'RESERVATION_REVIVE_NO_CAPACITY',
  CATEGORY_DAY_CONFLICT: 'RESERVATION_REVIVE_CATEGORY_DAY_CONFLICT',
  CLIENT_OVERLAP: 'RESERVATION_REVIVE_CLIENT_OVERLAP',
  CONCURRENT_CHANGE: 'RESERVATION_REVIVE_CONCURRENT_CHANGE',
} as const;

export type ReviveErrorCode =
  (typeof REVIVE_ERROR_CODES)[keyof typeof REVIVE_ERROR_CODES];

export class ReviveReservationException extends DomainException {
  constructor(code: ReviveErrorCode, message: string, reservationId: string) {
    super({ code, message, reservationId });
  }
}
