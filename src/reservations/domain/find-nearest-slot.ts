export function findNearestSlot(
  candidates: Date[],
  idealTime: Date,
): Date | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate.getTime() - idealTime.getTime()) <
    Math.abs(closest.getTime() - idealTime.getTime())
      ? candidate
      : closest,
  );
}
