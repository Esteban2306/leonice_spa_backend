import { SiigoSyncStatus } from '@prisma/client';
import { SiigoError } from '../client/siigo.errors';

export const SIIGO_MAX_ATTEMPTS = 8;
export const SIIGO_STALE_SENDING_MS = 10 * 60_000;
export const SIIGO_REQUESTS_PER_SWEEP = 90;
export const SIIGO_SWEEP_INTERVAL_MS = 60_000;
export const SIIGO_CANDIDATE_LIMIT = 200;

const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;
const MAX_ERROR_LENGTH = 500;

export type FailureAction = 'RETRY' | 'FAIL' | 'BLOCK' | 'PAUSE';

export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** exponent, MAX_RETRY_DELAY_MS);
}

export function decideFailure(error: unknown, attempts: number): FailureAction {
  if (!(error instanceof SiigoError)) return 'BLOCK';
  if (error.kind === 'AUTH' || error.kind === 'NOT_CONFIGURED') return 'PAUSE';
  if (error.retryable) return attempts >= SIIGO_MAX_ATTEMPTS ? 'FAIL' : 'RETRY';
  return 'BLOCK';
}

export interface SyncCandidate {
  status: SiigoSyncStatus;
  attempts: number;
  updatedAt: Date;
}

export function isDue(candidate: SyncCandidate, now: Date): boolean {
  const idleMs = now.getTime() - candidate.updatedAt.getTime();
  if (candidate.status === SiigoSyncStatus.ENVIANDO) {
    return idleMs >= SIIGO_STALE_SENDING_MS;
  }
  if (candidate.status !== SiigoSyncStatus.PENDIENTE) return false;
  if (candidate.attempts === 0) return true;
  return idleMs >= retryDelayMs(candidate.attempts);
}

export function describeFailure(error: unknown): string {
  const text =
    error instanceof SiigoError
      ? [
          error.message,
          ...error.details.map((d) => `${d.code}: ${d.message}`),
        ].join(' | ')
      : error instanceof Error
        ? error.message
        : 'Error desconocido';
  return text.slice(0, MAX_ERROR_LENGTH);
}
