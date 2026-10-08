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

  return first.slotIsos.filter((startIso) => {
    const start = new Date(startIso);
    if (start.getTime() < earliest.getTime()) return false;

    let cursor = start.getTime() + first.durationMinutes * 60_000;
    for (const [index, segment] of rest.entries()) {
      if (!restSets[index].has(new Date(cursor).toISOString())) return false;
      cursor += segment.durationMinutes * 60_000;
    }
    return true;
  });
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
