import { ReservationStatus } from '@prisma/client';
import {
  getHairProfileStatus,
  type HairProfileFields,
  type HairProfileStatus,
} from '../../clients/domain/hair-profile.util';

export type AssessmentState = 'PENDING' | 'DONE' | 'NOT_REQUIRED';

export type AssessmentReason = 'REQUIRES_ASSESSMENT' | 'HAIR_PRICING';

export interface ReservationAssessment {
  state: AssessmentState;
  reason: AssessmentReason | null;
  hairProfileStatus: HairProfileStatus;
}

const ASSESSABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
  ReservationStatus.CITA_EN_CURSO,
];

export function resolveReservationAssessment(
  reservation: {
    status: ReservationStatus;
    treatment: {
      requiresPriorAssessment?: boolean;
      hasHairVariablePricing?: boolean;
    };
    client: Partial<HairProfileFields>;
  },
  now: Date = new Date(),
): ReservationAssessment {
  const hairProfileStatus = getHairProfileStatus(
    {
      hairLength: reservation.client.hairLength ?? null,
      hairColor: reservation.client.hairColor ?? null,
      hairProfileUpdatedAt: reservation.client.hairProfileUpdatedAt ?? null,
    },
    now,
  );
  const reason: AssessmentReason | null = reservation.treatment
    .requiresPriorAssessment
    ? 'REQUIRES_ASSESSMENT'
    : reservation.treatment.hasHairVariablePricing
      ? 'HAIR_PRICING'
      : null;

  if (reason === null) {
    return { state: 'NOT_REQUIRED', reason, hairProfileStatus };
  }
  if (hairProfileStatus === 'VALID') {
    return { state: 'DONE', reason, hairProfileStatus };
  }
  return {
    state: ASSESSABLE_STATUSES.includes(reservation.status)
      ? 'PENDING'
      : 'NOT_REQUIRED',
    reason,
    hairProfileStatus,
  };
}
