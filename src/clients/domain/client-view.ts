import {
  CancellationSource,
  Client,
  ConsentType,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { utcMidnightToCalendarDate } from '../../common/validation/date-input.validators';
import { HairProfileView, toHairProfileView } from './hair-profile.util';

export interface ClientView {
  id: string;
  name: string;
  phone: string;
  whatsappJid: string | null;
  birthDate: string;
  allergies: string | null;
  isPregnant: boolean;
  hairProfile: HairProfileView;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientReservationSummary {
  reservationId: string;
  status: ReservationStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  treatment: string;
  category: string;
  finalPrice: number;
  comboGroupId: string | null;
  cancellationSource: CancellationSource | null;
}

export interface ClientConsentSummary {
  type: ConsentType;
  policyVersion: string;
  consentedAt: Date;
}

export type ClientReservationStats = Record<
  'total' | 'completed' | 'cancelled' | 'noShow' | 'upcoming',
  number
>;

export interface ClientDetailView extends ClientView {
  stats: ClientReservationStats;
  reservations: ClientReservationSummary[];
  consents: ClientConsentSummary[];
}

export function toClientView(client: Client, now = new Date()): ClientView {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    whatsappJid: client.whatsappJid,
    birthDate: utcMidnightToCalendarDate(client.birthDate),
    allergies: client.allergies,
    isPregnant: client.isPregnant,
    hairProfile: toHairProfileView(client, now),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export function toClientReservationSummary(reservation: {
  id: string;
  status: ReservationStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  finalPrice: Prisma.Decimal;
  comboGroupId: string | null;
  cancellationSource: CancellationSource | null;
  treatment: { name: string };
  category: { name: string };
}): ClientReservationSummary {
  return {
    reservationId: reservation.id,
    status: reservation.status,
    scheduledStart: reservation.scheduledStart,
    scheduledEnd: reservation.scheduledEnd,
    treatment: reservation.treatment.name,
    category: reservation.category.name,
    finalPrice: reservation.finalPrice.toNumber(),
    comboGroupId: reservation.comboGroupId,
    cancellationSource: reservation.cancellationSource,
  };
}

export const UPCOMING_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
];

export function computeReservationStats(
  counts: ReadonlyArray<{ status: ReservationStatus; count: number }>,
  upcoming: number,
): ClientReservationStats {
  const of = (status: ReservationStatus) =>
    counts.find((c) => c.status === status)?.count ?? 0;
  return {
    total: counts.reduce((sum, c) => sum + c.count, 0),
    completed: of(ReservationStatus.COMPLETADA),
    cancelled: of(ReservationStatus.CANCELADA),
    noShow: of(ReservationStatus.NO_SHOW),
    upcoming,
  };
}
