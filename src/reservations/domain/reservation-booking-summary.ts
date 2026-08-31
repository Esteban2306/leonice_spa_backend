import { formatLocalTime } from './format-local-time';

export interface BookedSegmentSummary {
  treatmentName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  wasAdjusted: boolean;
  adjustmentReason?: string;
}

export function buildBookingSummary(segments: BookedSegmentSummary[]): string {
  if (segments.length === 1) {
    const s = segments[0];
    const base = `Tu cita de ${s.treatmentName} quedó para las ${formatLocalTime(s.scheduledStart)}`;
    return s.wasAdjusted ? `${base} (${s.adjustmentReason}).` : `${base}.`;
  }

  const parts = segments.map(
    (s) =>
      `${s.treatmentName} de ${formatLocalTime(s.scheduledStart)} a ${formatLocalTime(s.scheduledEnd)}`,
  );
  return `Tu cita quedó organizada así: ${parts.join(', ')}.`;
}
