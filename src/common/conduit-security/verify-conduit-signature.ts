import { createHmac, timingSafeEqual } from 'node:crypto';

/** Ventana aceptada entre el timestamp firmado y el reloj local. */
export const CONDUIT_SIGNATURE_WINDOW_SECONDS = 300;

function safeEquals(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

/** Firma V1 (legado): HMAC del cuerpo, sin protección contra reenvíos. */
export function verifyConduitMessageStatusSignature(
  rawBody: Buffer,
  receivedSignature: string | undefined,
  webhookSecret: string,
): boolean {
  if (!receivedSignature) return false;
  const expected = `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`;
  return safeEquals(receivedSignature, expected);
}

/**
 * Firma V2: HMAC de `${timestamp}.${cuerpo}`. Un webhook capturado no
 * sirve para reenviarlo pasados unos minutos.
 */
export function verifyConduitMessageStatusSignatureV2(
  rawBody: Buffer,
  receivedSignature: string | undefined,
  timestampHeader: string | undefined,
  webhookSecret: string,
  nowMs = Date.now(),
): boolean {
  if (!receivedSignature || !timestampHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp)) return false;
  if (
    Math.abs(Math.floor(nowMs / 1000) - timestamp) >
    CONDUIT_SIGNATURE_WINDOW_SECONDS
  ) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', webhookSecret)
    .update(`${timestampHeader}.`)
    .update(rawBody)
    .digest('hex')}`;
  return safeEquals(receivedSignature, expected);
}
