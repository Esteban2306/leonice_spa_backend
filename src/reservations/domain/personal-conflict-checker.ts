export interface TimeInterval {
  start: Date;
  end: Date;
}

export function overlapsAny(
  candidateStart: Date,
  candidateEnd: Date,
  intervals: TimeInterval[],
): boolean {
  return intervals.some(
    (iv) =>
      candidateStart.getTime() < iv.end.getTime() &&
      iv.start.getTime() < candidateEnd.getTime(),
  );
}

/* Si hay varios conflictos, devuelve el final del que termina más tarde — así 
    el siguiente intento nunca vuelve a chocar con ninguno de ellos. */
export function latestConflictEnd(
  candidateStart: Date,
  candidateEnd: Date,
  intervals: TimeInterval[],
): Date | null {
  const conflicting = intervals.filter(
    (iv) =>
      candidateStart.getTime() < iv.end.getTime() &&
      iv.start.getTime() < candidateEnd.getTime(),
  );
  if (conflicting.length === 0) return null;
  return conflicting.reduce(
    (latest, iv) => (iv.end.getTime() > latest.getTime() ? iv.end : latest),
    conflicting[0].end,
  );
}
