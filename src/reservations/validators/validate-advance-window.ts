import { BadRequestException } from '@nestjs/common';
import {
  MAX_ADVANCE_DAYS,
  MIN_LEAD_MINUTES,
} from '../domain/reservation-timing.constants';

export function earliestBookableStart(now: Date = new Date()): Date {
  return new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
}

export function validateAdvancedWindow(
  scheduledStart: Date,
  now: Date = new Date(),
): void {
  if (scheduledStart.getTime() < earliestBookableStart(now).getTime()) {
    throw new BadRequestException(
      `La reserva debe hacerse con al menos ${MIN_LEAD_MINUTES} minutos de anticipación`,
    );
  }
  const diffDays =
    (scheduledStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_ADVANCE_DAYS) {
    throw new BadRequestException(
      `La reserva no puede hacerse con más de ${MAX_ADVANCE_DAYS} días de anticipación`,
    );
  }
}
