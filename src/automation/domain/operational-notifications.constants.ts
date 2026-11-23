import type { JobsOptions } from 'bullmq';

export const OPERATIONAL_TEMPLATE_ENV_KEYS = {
  ADMIN_DEPOSIT_TIMEOUT: 'CONDUIT_TEMPLATE_ADMIN_DEPOSIT_TIMEOUT',
  CLIENT_DEPOSIT_REJECTED: 'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED',
  CLIENT_DEPOSIT_REJECTED_NO_DEADLINE:
    'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED_NO_DEADLINE',
  CLIENT_RESERVATION_CONFIRMED: 'CONDUIT_TEMPLATE_CLIENT_RESERVATION_CONFIRMED',
  CLIENT_DEPOSIT_REMINDER: 'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REMINDER',
  CLIENT_LEAD_FOLLOW_UP: 'CONDUIT_TEMPLATE_CLIENT_LEAD_FOLLOW_UP',
  CLIENT_CANCELLED_BY_ADMIN: 'CONDUIT_TEMPLATE_CLIENT_CANCELLED_BY_ADMIN',
  CLIENT_RESCHEDULED: 'CONDUIT_TEMPLATE_CLIENT_RESCHEDULED',
  ADMIN_RESCHEDULED: 'CONDUIT_TEMPLATE_ADMIN_RESCHEDULED',
  CLIENT_CANCELLATION_CONFIRMED:
    'CONDUIT_TEMPLATE_CLIENT_CANCELLATION_CONFIRMED',
  ADMIN_CLIENT_CANCELLED: 'CONDUIT_TEMPLATE_ADMIN_CLIENT_CANCELLED',
  CLIENT_CANCELLATION_LINK: 'CONDUIT_TEMPLATE_CLIENT_CANCELLATION_LINK',
  ADMIN_HANDOFF: 'CONDUIT_TEMPLATE_ADMIN_HANDOFF',
  ADMIN_PRODUCT_PURCHASE: 'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PURCHASE',
  ADMIN_PRODUCT_PAYMENT: 'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PAYMENT',
  CLIENT_PRODUCT_PAYMENT_REJECTED:
    'CONDUIT_TEMPLATE_CLIENT_PRODUCT_PAYMENT_REJECTED',
  ADMIN_RECEIPT_REVIEW: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_REVIEW',
  ADMIN_RECEIPT_RETRIES: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_RETRIES',
  ADMIN_IN_PROGRESS: 'CONDUIT_TEMPLATE_ADMIN_IN_PROGRESS',
  CLIENT_EVENT_TICKET: 'CONDUIT_TEMPLATE_CLIENT_EVENT_TICKET',
  CLIENT_EVENT_WINNER: 'CONDUIT_TEMPLATE_CLIENT_EVENT_WINNER',
} as const;

export type OperationalTemplate = keyof typeof OPERATIONAL_TEMPLATE_ENV_KEYS;

export const OPERATIONAL_EMAIL_TEMPLATE_ENV_KEYS: Partial<
  Record<OperationalTemplate, string>
> = {
  ADMIN_DEPOSIT_TIMEOUT: 'CONDUIT_TEMPLATE_ADMIN_DEPOSIT_TIMEOUT_EMAIL',
  ADMIN_RESCHEDULED: 'CONDUIT_TEMPLATE_ADMIN_RESCHEDULED_EMAIL',
  ADMIN_CLIENT_CANCELLED: 'CONDUIT_TEMPLATE_ADMIN_CLIENT_CANCELLED_EMAIL',
  ADMIN_HANDOFF: 'CONDUIT_TEMPLATE_ADMIN_HANDOFF_EMAIL',
  ADMIN_PRODUCT_PURCHASE: 'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PURCHASE_EMAIL',
  ADMIN_RECEIPT_REVIEW: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_REVIEW_EMAIL',
  ADMIN_RECEIPT_RETRIES: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_RETRIES_EMAIL',
  ADMIN_IN_PROGRESS: 'CONDUIT_TEMPLATE_ADMIN_IN_PROGRESS_EMAIL',
};

export const ADMIN_TIMEOUT_NOTICE_DELAY_MS = 60_000;

export const NOTICE_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
};

export interface AdminDepositTimeoutNoticeJobData {
  reservationId: string;
  recipientId: string;
}

export interface ClientDepositRejectedNoticeJobData {
  reservationId: string;
  hasDeadline: boolean;
}

export interface ClientReservationConfirmedNoticeJobData {
  reservationId: string;
}

export interface ClientDepositReminderJobData {
  reservationId: string;
  expiresAt: string;
}

export interface ClientCancelledByAdminNoticeJobData {
  reservationId: string;
  reason: string;
}

export interface RescheduleNoticeJobData {
  reservationId: string;
  previousScheduledStart: string;
}

export type CancellationChannel = 'WEB' | 'LINK' | 'WHATSAPP';

export interface ClientCancellationNoticeJobData {
  reservationId: string;
  reservationIds: string[];
  channel: CancellationChannel;
}

export interface AdminClientCancellationNoticeJobData extends ClientCancellationNoticeJobData {
  recipientId: string;
}

export interface CancellationLinkNoticeJobData {
  reservationId: string;
  url: string;
}

export interface AdminHandoffNoticeJobData {
  recipientId: string;
  phone: string | null;
  lid: string | null;
  clientName: string | null;
  reason: string;
  summary: string | null;
}

export interface AdminProductPurchaseNoticeJobData {
  recipientId: string;
  phone: string | null;
  lid: string | null;
  clientName: string | null;
  request: string;
  notes: string | null;
}

export interface AdminProductPaymentNoticeJobData {
  recipientId: string;
  orderId: string;
}

export interface ClientProductPaymentNoticeJobData {
  orderId: string;
  reason?: string;
}

export interface ClientEventTicketNoticeJobData {
  ticketId: string;
}

export interface AdminInProgressNoticeJobData {
  recipientId: string;
  digestId: string;
  total: number;
  lines: string[];
}

export interface AdminReceiptNoticeJobData {
  recipientId: string;
  kind: 'REVIEW' | 'RETRIES';
  phone: string | null;
  clientName: string | null;
  reason: string;
  attempts: number;
}

export interface AdminRescheduleNoticeJobData extends RescheduleNoticeJobData {
  recipientId: string;
  source: 'CLIENT' | 'ADMIN';
}
