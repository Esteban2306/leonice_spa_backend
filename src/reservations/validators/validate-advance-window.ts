import { BadRequestException } from '@nestjs/common';
import {
  MAX_ADVANCE_DAYS,
  MIN_ADVANCE_DAYS,
} from '../domain/reservation-timing.constants';

export function validateAdvancedWindow(
  scheduledStart: Date,
  now: Date = new Date(),
): void {
  const diffDays =
    (scheduledStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < MIN_ADVANCE_DAYS) {
    throw new BadRequestException(
      `La reserva debe hacerse con al menos ${MIN_ADVANCE_DAYS} día de anticipación`,
    );
  }
  if (diffDays > MAX_ADVANCE_DAYS) {
    throw new BadRequestException(
      `La reserva no puede hacerse con más de ${MAX_ADVANCE_DAYS} días de anticipación`,
    );
  }
}
