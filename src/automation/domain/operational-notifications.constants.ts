import type { JobsOptions } from 'bullmq';

export const OPERATIONAL_TEMPLATE_ENV_KEYS = {
  ADMIN_DEPOSIT_TIMEOUT: 'CONDUIT_TEMPLATE_ADMIN_DEPOSIT_TIMEOUT',
  CLIENT_DEPOSIT_REJECTED: 'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED',
  CLIENT_DEPOSIT_REJECTED_NO_DEADLINE:
    'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED_NO_DEADLINE',
  CLIENT_RESCHEDULED: 'CONDUIT_TEMPLATE_CLIENT_RESCHEDULED',
  ADMIN_RESCHEDULED: 'CONDUIT_TEMPLATE_ADMIN_RESCHEDULED',
} as const;

export type OperationalTemplate = keyof typeof OPERATIONAL_TEMPLATE_ENV_KEYS;

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

export interface RescheduleNoticeJobData {
  reservationId: string;
  previousScheduledStart: string;
}

export interface AdminRescheduleNoticeJobData extends RescheduleNoticeJobData {
  recipientId: string;
  source: 'CLIENT' | 'ADMIN';
}
