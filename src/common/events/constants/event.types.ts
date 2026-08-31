import { ReservationChannel, ReservationStatus } from '@prisma/client';

export const EVENT_TYPES = {
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_CONFIRMED: 'reservation.confirmed',
  RESERVATION_CANCELLED: 'reservation.cancelled',
  RESERVATION_RESCHEDULED: 'reservation.rescheduled',
  RESERVATION_COMPLETED: 'reservation.completed',
  RESERVATION_NO_SHOW: 'reservation.no_show',
  RESERVATION_RESCHEDULED_BY_ADMIN: 'reservation.rescheduled_by_admin',
  RESERVATION_CANCELLED_BY_ADMIN: 'reservation.cancelled_by_admin',
  RESERVATION_NEEDS_HAIR_PROFILE: 'reservation.needs_hair_profile',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface EventPayloadMap {
  [EVENT_TYPES.RESERVATION_CREATED]: {
    reservationId: string;
    clientId: string;
    clientPhone: string;
    treatmentId: string;
    categoryId: string;
    status: ReservationStatus;
    scheduledStart: Date;
    channel: ReservationChannel;
  };

  [EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN]: {
    reservationId: string;
    clientId: string;
    newScheduledStart: Date;
    internalNote?: string;
  };

  [EVENT_TYPES.RESERVATION_CANCELLED_BY_ADMIN]: {
    reservationId: string;
    clientId: string;
    reason?: string;
  };

  [EVENT_TYPES.RESERVATION_NEEDS_HAIR_PROFILE]: {
    reservationId: string;
    clientId: string;
    clientPhone: string;
    treatmentId: string;
    treatmentName: string;
    scheduledStart: Date;
  };

  [EVENT_TYPES.RESERVATION_CONFIRMED]: {
    reservationId: string;
    clientId: string;
    scheduledStart: Date;
  };

  [EVENT_TYPES.RESERVATION_CANCELLED]: {
    reservationId: string;
    clientId: string;
    reason?: string;
  };

  [EVENT_TYPES.RESERVATION_RESCHEDULED]: {
    originalReservationId: string;
    newReservationId: string;
    clientId: string;
    newScheduledStart: Date;
  };

  [EVENT_TYPES.RESERVATION_COMPLETED]: {
    reservationId: string;
    clientId: string;
    treatmentId: string;
    categoryId: string;
  };

  [EVENT_TYPES.RESERVATION_NO_SHOW]: {
    reservationId: string;
    clientId: string;
    scheduledStart: Date;
  };
}
