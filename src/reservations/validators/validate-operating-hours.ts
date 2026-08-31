import { BadRequestException } from '@nestjs/common';
import { getOperatingWindowsForDate } from '../domain/operating-hours';

export function validateOperatingHours(
  scheduledStart: Date,
  scheduledEnd: Date,
): void {
  const windows = getOperatingWindowsForDate(scheduledStart);
  const fits = windows.some(
    (w) =>
      scheduledStart.getTime() >= w.start.getTime() &&
      scheduledEnd.getTime() <= w.end.getTime(),
  );
  if (!fits) {
    throw new BadRequestException(
      'El horario solicitado está fuera del horario de atención del spa',
    );
  }
}
