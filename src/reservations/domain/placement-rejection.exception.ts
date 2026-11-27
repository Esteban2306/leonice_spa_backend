import { AppException } from '../../common/errors/app.exception';
import type { ErrorCode } from '../../common/errors/error-catalog';
import type { PlacementRejection } from './evaluate-placement';

export const PLACEMENT_ERROR_CODES = {
  INVALID_RANGE: 'PLACEMENT_INVALID_RANGE',
  IN_THE_PAST: 'PLACEMENT_IN_THE_PAST',
  OUTSIDE_OPERATING_HOURS: 'PLACEMENT_OUTSIDE_OPERATING_HOURS',
  DUPLICATE_BOOKING: 'PLACEMENT_DUPLICATE_BOOKING',
  NO_CAPACITY: 'PLACEMENT_NO_CAPACITY',
} as const satisfies Record<PlacementRejection, ErrorCode>;

export function placementRejectionException(
  reason: PlacementRejection,
): AppException {
  return new AppException(PLACEMENT_ERROR_CODES[reason]);
}
