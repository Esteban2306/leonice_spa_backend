import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CancellationLinkClaims {
  clientId: string;
  reservationId: string;
  expiresAt: Date;
}

export type CancellationLinkVerification =
  | { ok: true; claims: CancellationLinkClaims }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' };

interface WirePayload {
  v: 1;
  c: string;
  r: string;
  e: number;
}

function sign(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signCancellationLink(
  secret: string,
  claims: CancellationLinkClaims,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      c: claims.clientId,
      r: claims.reservationId,
      e: Math.floor(claims.expiresAt.getTime() / 1000),
    } satisfies WirePayload),
  ).toString('base64url');
  return `${payload}.${sign(secret, payload).toString('base64url')}`;
}

function parsePayload(encoded: string): WirePayload | null {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    if (
      value &&
      typeof value === 'object' &&
      (value as WirePayload).v === 1 &&
      typeof (value as WirePayload).c === 'string' &&
      typeof (value as WirePayload).r === 'string' &&
      Number.isInteger((value as WirePayload).e)
    ) {
      return value as WirePayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyCancellationLink(
  secret: string,
  token: string,
  now: Date = new Date(),
): CancellationLinkVerification {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'INVALID' };
  }
  const [payload, signature] = parts;
  const expected = sign(secret, payload);
  const received = Buffer.from(signature, 'base64url');
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return { ok: false, reason: 'INVALID' };
  }

  const wire = parsePayload(payload);
  if (!wire) return { ok: false, reason: 'INVALID' };
  if (wire.e * 1000 <= now.getTime()) return { ok: false, reason: 'EXPIRED' };

  return {
    ok: true,
    claims: {
      clientId: wire.c,
      reservationId: wire.r,
      expiresAt: new Date(wire.e * 1000),
    },
  };
}
