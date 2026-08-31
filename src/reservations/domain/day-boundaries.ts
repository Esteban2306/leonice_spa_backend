export interface DayBoundaries {
  dayStart: Date;
  dayEnd: Date;
}

export function getDayBoundaries(date: Date): DayBoundaries {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, dayEnd };
}
