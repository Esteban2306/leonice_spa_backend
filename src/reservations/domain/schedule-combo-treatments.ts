import { orderComboSegments } from './combo-availability';

export interface TreatmentTimingInput {
  treatmentId: string;
  treatmentName: string;
  categoryId: string;
  categoryName: string;
  isPrincipal: boolean;
  durationMinutes: number;
  price: number;
  forcesAssessment: boolean;
  needsHairProfile: boolean;
}

export interface ScheduledSegment extends TreatmentTimingInput {
  scheduledStart: Date;
  scheduledEnd: Date;
}

export function scheduleComboTreatments(
  treatments: TreatmentTimingInput[],
  requestedStart: Date,
): ScheduledSegment[] {
  return orderComboSegments(treatments).map((treatment) => ({
    ...treatment,
    scheduledStart: requestedStart,
    scheduledEnd: new Date(
      requestedStart.getTime() + treatment.durationMinutes * 60_000,
    ),
  }));
}
