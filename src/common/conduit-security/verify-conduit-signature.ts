import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyConduitMessageStatusSignature(
  rawBody: Buffer,
  receivedSignature: string | undefined,
  webhookSecret: string,
): boolean {
  if (!receivedSignature) return false;

  const expected = `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`;

  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
