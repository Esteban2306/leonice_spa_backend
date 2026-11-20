export interface ComboSegmentAvailability {
  durationMinutes: number;
  slotIsos: readonly string[];
}

export function findComboStarts(
  segments: readonly ComboSegmentAvailability[],
  earliest: Date,
): string[] {
  if (segments.length === 0) return [];
  const [first, ...rest] = segments;
  const restSets = rest.map((segment) => new Set(segment.slotIsos));

  return first.slotIsos.filter(
    (startIso) =>
      new Date(startIso).getTime() >= earliest.getTime() &&
      restSets.every((slots) => slots.has(startIso)),
  );
}

export function orderComboSegments<T extends { isPrincipal: boolean }>(
  treatments: readonly T[],
): T[] {
  const anchor = treatments.findIndex((t) => t.isPrincipal);
  const anchorIndex = anchor >= 0 ? anchor : 0;
  return [
    treatments[anchorIndex],
    ...treatments.filter((_, index) => index !== anchorIndex),
  ];
}
