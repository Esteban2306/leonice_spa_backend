import { ClientTagKey, ReservationStatus } from '@prisma/client';

export const NEW_CLIENT_DAYS = 60;
export const RECURRING_WINDOW_DAYS = 180;
export const RECURRING_MIN_VISITS = 3;
export const PAUSED_AFTER_DAYS = 90;
export const INACTIVE_AFTER_DAYS = 365;
export const NO_SHOW_WINDOW_DAYS = 365;
export const NO_SHOW_REPEATED_MIN = 2;
export const BIRTHDAY_SOON_DAYS = 30;
export const FREQUENT_WINDOW_DAYS = 365;
export const FREQUENT_MIN_VISITS = 2;
export const FREQUENT_CATEGORY_LIMIT = 2;
export const PROMOTION_WINDOW_DAYS = 365;

const DAY_MS = 86_400_000;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

const UPCOMING_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.CONFIRMADA,
  ReservationStatus.CITA_EN_CURSO,
];

const PENDING_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.SOLICITUD_INICIADA,
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
];

export interface TagReservation {
  status: ReservationStatus;
  scheduledStart: Date;
  completedAt: Date | null;
  categoryName: string;
  treatmentName: string;
}

export interface TagClientInput {
  birthDate: Date;
  reservations: readonly TagReservation[];
}

export interface DerivedTag {
  key: ClientTagKey;
  detail: string;
}

const daysBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / DAY_MS;

function daysUntilBirthday(birthDate: Date, now: Date): number {
  const today = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  let next = Date.UTC(
    today.getUTCFullYear(),
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );
  if (next < todayUtc) {
    next = Date.UTC(
      today.getUTCFullYear() + 1,
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(),
    );
  }
  return Math.round((next - todayUtc) / DAY_MS);
}

function topByCount(
  names: readonly string[],
  limit: number,
  minCount: number,
): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, limit)
    .map(([name]) => name);
}

export function deriveClientTags(
  input: TagClientInput,
  now: Date,
): DerivedTag[] {
  const tags: DerivedTag[] = [];
  const add = (key: ClientTagKey, detail = '') => tags.push({ key, detail });

  const completed = input.reservations
    .filter((item) => item.status === ReservationStatus.COMPLETADA)
    .map((item) => ({
      ...item,
      visitedAt: item.completedAt ?? item.scheduledStart,
    }))
    .sort((a, b) => a.visitedAt.getTime() - b.visitedAt.getTime());

  const within = (days: number) =>
    completed.filter((item) => daysBetween(item.visitedAt, now) <= days);

  const noShows = input.reservations.filter(
    (item) =>
      item.status === ReservationStatus.NO_SHOW &&
      daysBetween(item.scheduledStart, now) <= NO_SHOW_WINDOW_DAYS,
  ).length;
  const repeatedNoShow = noShows >= NO_SHOW_REPEATED_MIN;

  if (
    input.reservations.some(
      (item) =>
        UPCOMING_STATUSES.includes(item.status) && item.scheduledStart >= now,
    )
  ) {
    add(ClientTagKey.CON_CITA_PROXIMA);
  }
  if (
    input.reservations.some(
      (item) =>
        PENDING_STATUSES.includes(item.status) && item.scheduledStart >= now,
    )
  ) {
    add(ClientTagKey.RESERVA_PENDIENTE);
  }

  if (completed.length === 0) {
    add(ClientTagKey.SIN_VISITAS);
  } else {
    const first = completed[0].visitedAt;
    const last = completed[completed.length - 1].visitedAt;
    const sinceLast = daysBetween(last, now);

    if (daysBetween(first, now) <= NEW_CLIENT_DAYS) {
      add(ClientTagKey.NUEVA);
    }
    if (within(RECURRING_WINDOW_DAYS).length >= RECURRING_MIN_VISITS) {
      add(ClientTagKey.RECURRENTE);
    }
    if (sinceLast > INACTIVE_AFTER_DAYS) {
      add(ClientTagKey.INACTIVA);
    } else if (sinceLast > PAUSED_AFTER_DAYS) {
      add(ClientTagKey.EN_PAUSA);
    }

    const recent = within(FREQUENT_WINDOW_DAYS);
    for (const category of topByCount(
      recent.map((item) => item.categoryName),
      FREQUENT_CATEGORY_LIMIT,
      FREQUENT_MIN_VISITS,
    )) {
      add(ClientTagKey.FRECUENTA, category);
    }
    for (const treatment of topByCount(
      recent.map((item) => item.treatmentName),
      1,
      FREQUENT_MIN_VISITS,
    )) {
      add(ClientTagKey.REPITE_SERVICIO, treatment);
    }

    if (within(PROMOTION_WINDOW_DAYS).length >= 1 && !repeatedNoShow) {
      add(ClientTagKey.APTA_PROMOCION);
    }
  }

  if (repeatedNoShow) add(ClientTagKey.NO_SHOW_REITERADO);
  if (daysUntilBirthday(input.birthDate, now) <= BIRTHDAY_SOON_DAYS) {
    add(ClientTagKey.CUMPLE_PRONTO);
  }

  return tags;
}
