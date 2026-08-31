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

export function sequenceComboTreatments(
  treatments: TreatmentTimingInput[],
  requestedStart: Date,
): ScheduledSegment[] {
  const anchorIndex = treatments.findIndex((t) => t.isPrincipal);
  const effectiveAnchorIndex = anchorIndex >= 0 ? anchorIndex : 0;
  const ordered = [
    treatments[effectiveAnchorIndex],
    ...treatments.filter((_, i) => i !== effectiveAnchorIndex),
  ];

  const segments: ScheduledSegment[] = [];
  let cursor = requestedStart;
  for (const treatment of ordered) {
    const scheduledEnd = new Date(
      cursor.getTime() + treatment.durationMinutes * 60_000,
    );
    segments.push({ ...treatment, scheduledStart: cursor, scheduledEnd });
    cursor = scheduledEnd;
  }
  return segments;
}
