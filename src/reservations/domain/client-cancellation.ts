import { CancellationSource, ReservationStatus } from '@prisma/client';

export const CLIENT_CANCELLATION_SCOPES = ['SINGLE', 'DAY'] as const;
export type ClientCancellationScope =
  (typeof CLIENT_CANCELLATION_SCOPES)[number];

export const CLIENT_CANCELLATION_CHANNELS = [
  'WEB',
  'LINK',
  'WHATSAPP',
] as const;
export type ClientCancellationChannel =
  (typeof CLIENT_CANCELLATION_CHANNELS)[number];

export const CLIENT_CANCELLABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
];

export interface CancellationCandidate {
  id: string;
  status: ReservationStatus;
  scheduledStart: Date;
  cancellationSource: CancellationSource | null;
}

export type ClientCancellationPlan =
  | {
      ok: true;
      toCancel: CancellationCandidate[];
      alreadyCancelled: CancellationCandidate[];
    }
  | {
      ok: false;
      code: 'RESERVATION_NOT_CANCELLABLE' | 'RESERVATION_CANCEL_TOO_LATE';
      reservationId: string;
    };

function isAlreadyCancelledByClient(candidate: CancellationCandidate): boolean {
  return (
    candidate.status === ReservationStatus.CANCELADA &&
    candidate.cancellationSource === CancellationSource.CLIENT
  );
}

function isCancellable(candidate: CancellationCandidate): boolean {
  return CLIENT_CANCELLABLE_STATUSES.includes(candidate.status);
}

function hasStarted(candidate: CancellationCandidate, now: Date): boolean {
  return candidate.scheduledStart.getTime() <= now.getTime();
}

export function planClientCancellation(params: {
  target: CancellationCandidate;
  sameDay: readonly CancellationCandidate[];
  scope: ClientCancellationScope;
  now: Date;
}): ClientCancellationPlan {
  const { target, scope, now } = params;

  if (scope === 'SINGLE') {
    if (isAlreadyCancelledByClient(target)) {
      return { ok: true, toCancel: [], alreadyCancelled: [target] };
    }
    if (!isCancellable(target)) {
      return {
        ok: false,
        code: 'RESERVATION_NOT_CANCELLABLE',
        reservationId: target.id,
      };
    }
    if (hasStarted(target, now)) {
      return {
        ok: false,
        code: 'RESERVATION_CANCEL_TOO_LATE',
        reservationId: target.id,
      };
    }
    return { ok: true, toCancel: [target], alreadyCancelled: [] };
  }

  const day = params.sameDay.some((r) => r.id === target.id)
    ? params.sameDay
    : [target, ...params.sameDay];
  const alreadyCancelled = day.filter(isAlreadyCancelledByClient);
  const cancellable = day.filter(isCancellable);
  const toCancel = cancellable.filter((r) => !hasStarted(r, now));

  if (toCancel.length === 0 && alreadyCancelled.length === 0) {
    const started = cancellable.find((r) => hasStarted(r, now));
    return {
      ok: false,
      code: started
        ? 'RESERVATION_CANCEL_TOO_LATE'
        : 'RESERVATION_NOT_CANCELLABLE',
      reservationId: (started ?? target).id,
    };
  }
  return { ok: true, toCancel, alreadyCancelled };
}
