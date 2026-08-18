export interface TimeWindow {
  start: Date;
  end: Date;
}

const WEEKDAY_WINDOWS = [
  { startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { startHour: 14, startMinute: 0, endHour: 16, endMinute: 0 },
];

const WEEKEND_WINDOWS = [
  { startHour: 7, startMinute: 0, endHour: 12, endMinute: 0 },
  { startHour: 14, startMinute: 0, endHour: 16, endMinute: 0 },
];

export function getOperatingWindowsForDate(date: Date): TimeWindow[] {
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const windows = isWeekend ? WEEKEND_WINDOWS : WEEKDAY_WINDOWS;

  return windows.map((w) => {
    const start = new Date(date);
    start.setHours(w.startHour, w.startMinute, 0, 0);
    const end = new Date(date);
    end.setHours(w.endHour, w.endMinute, 0, 0);
    return { start, end };
  });
}
