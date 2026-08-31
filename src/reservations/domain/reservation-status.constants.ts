import { ReservationStatus } from '@prisma/client';

export const HOLDING_EXCLUDED_STATUSES: ReservationStatus[] = [
  ReservationStatus.CANCELADA,
  ReservationStatus.NO_SHOW,
  ReservationStatus.REPROGRAMADA,
];
