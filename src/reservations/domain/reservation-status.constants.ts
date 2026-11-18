import { ReservationStatus } from '@prisma/client';

export const HOLDING_EXCLUDED_STATUSES: ReservationStatus[] = [
  ReservationStatus.CANCELADA,
  ReservationStatus.NO_SHOW,
  ReservationStatus.REPROGRAMADA,
];

export const UNATTENDED_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.SOLICITUD_INICIADA,
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
];

export function noShowCountsAgainstClient(
  noShowFromStatus: ReservationStatus | null | undefined,
): boolean {
  return (
    noShowFromStatus === null ||
    noShowFromStatus === undefined ||
    noShowFromStatus === ReservationStatus.CONFIRMADA
  );
}
