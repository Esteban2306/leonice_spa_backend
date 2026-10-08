import { createHash } from 'node:crypto';

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export type IdempotencyRecord =
  | { state: 'IN_PROGRESS'; fingerprint: string }
  | {
      state: 'COMPLETED';
      fingerprint: string;
      statusCode: number;
      body: unknown;
    };

export type IdempotencyDecision =
  | { kind: 'EXECUTE' }
  | { kind: 'REPLAY'; statusCode: number; body: unknown }
  | {
      kind: 'REJECT';
      code: 'IDEMPOTENCY_KEY_REUSED' | 'IDEMPOTENCY_IN_PROGRESS';
    };

export function decideIdempotency(
  record: IdempotencyRecord | null,
  fingerprint: string,
): IdempotencyDecision {
  if (!record) return { kind: 'EXECUTE' };
  if (record.fingerprint !== fingerprint) {
    return { kind: 'REJECT', code: 'IDEMPOTENCY_KEY_REUSED' };
  }
  if (record.state === 'IN_PROGRESS') {
    return { kind: 'REJECT', code: 'IDEMPOTENCY_IN_PROGRESS' };
  }
  return { kind: 'REPLAY', statusCode: record.statusCode, body: record.body };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function fingerprintRequest(parts: {
  params: unknown;
  query: unknown;
  body: unknown;
}): string {
  return sha256(JSON.stringify(canonicalize(parts)));
}

export function idempotencyStoreKey(parts: {
  method: string;
  route: string;
  actor: string;
  key: string;
}): string {
  return `idempotency:${sha256(
    [parts.method, parts.route, parts.actor, parts.key].join('\n'),
  )}`;
}
