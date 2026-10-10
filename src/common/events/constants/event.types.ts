import { ReservationChannel, ReservationStatus } from '@prisma/client';

export const EVENT_TYPES = {
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_CONFIRMED: 'reservation.confirmed',
  RESERVATION_CANCELLED: 'reservation.cancelled',
  CLIENT_CANCELLATION_COMPLETED: 'reservation.client_cancellation_completed',
  CANCELLATION_LINK_REQUESTED: 'reservation.cancellation_link_requested',
  RESERVATION_RESCHEDULED: 'reservation.rescheduled',
  RESERVATION_COMPLETED: 'reservation.completed',
  RESERVATION_NO_SHOW: 'reservation.no_show',
  RESERVATION_RESCHEDULED_BY_ADMIN: 'reservation.rescheduled_by_admin',
  RESERVATION_CANCELLED_BY_ADMIN: 'reservation.cancelled_by_admin',
  RESERVATION_NEEDS_HAIR_PROFILE: 'reservation.needs_hair_profile',
  DEPOSIT_SUBMITTED_FOR_REVIEW: 'deposit.submitted_for_review',
  DEPOSIT_REJECTED: 'deposit.rejected',
  RESERVATION_CANCELLED_BY_TIMEOUT: 'reservation.cancelled_by_timeout',
  CONDUIT_HANDOFF_REQUESTED: 'conduit.handoff_requested',
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

  [EVENT_TYPES.DEPOSIT_REJECTED]: {
    depositId: string;
    reservationId: string;
    clientId: string;
    clientPhone: string;
    reason: string;
    newDeadline: Date | null;
  };

  [EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT]: {
    reservationId: string;
    clientId: string;
    comboGroupId: string | null;
  };

  [EVENT_TYPES.RESERVATION_RESCHEDULED_BY_ADMIN]: {
    reservationId: string;
    clientId: string;
    previousScheduledStart: Date;
    newScheduledStart: Date;
    notifyClient: boolean;
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

  [EVENT_TYPES.DEPOSIT_SUBMITTED_FOR_REVIEW]: {
    depositId: string;
    reservationId: string;
    clientId: string;
    clientPhone: string;
    imageUrl: string;
  };

  [EVENT_TYPES.RESERVATION_CANCELLED]: {
    reservationId: string;
    clientId: string;
    reason?: string;
  };

  [EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED]: {
    /** Teléfono verificado del chat; null si WhatsApp solo dio un LID. */
    phone: string | null;
    lid: string | null;
    clientName: string | null;
    reason: string;
    summary: string | null;
    requestId: string;
  };

  [EVENT_TYPES.CANCELLATION_LINK_REQUESTED]: {
    reservationId: string;
    url: string;
    expiresAt: Date;
  };

  [EVENT_TYPES.CLIENT_CANCELLATION_COMPLETED]: {
    clientId: string;
    reservationIds: string[];
    channel: 'WEB' | 'LINK' | 'WHATSAPP';
  };

  [EVENT_TYPES.RESERVATION_RESCHEDULED]: {
    originalReservationId: string;
    newReservationId: string;
    clientId: string;
    newScheduledStart: Date;
    previousScheduledStart: Date;
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
