import { BadRequestException } from '@nestjs/common';
import { getOperatingWindowsForDate } from '../domain/operating-hours';

export function fitsOperatingHours(
  scheduledStart: Date,
  scheduledEnd: Date,
): boolean {
  const windows = getOperatingWindowsForDate(scheduledStart);
  return windows.some(
    (w) =>
      scheduledStart.getTime() >= w.start.getTime() &&
      scheduledEnd.getTime() <= w.end.getTime(),
  );
}

export function validateOperatingHours(
  scheduledStart: Date,
  scheduledEnd: Date,
): void {
  if (!fitsOperatingHours(scheduledStart, scheduledEnd)) {
    throw new BadRequestException(
      'El horario solicitado está fuera del horario de atención del spa',
    );
  }
}
