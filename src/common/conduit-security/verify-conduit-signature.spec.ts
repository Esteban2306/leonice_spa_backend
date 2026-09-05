import { createHmac } from 'node:crypto';
import { verifyConduitMessageStatusSignature } from './verify-conduit-signature';

describe('verifyConduitMessageStatusSignature', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ event: 'message.sent' }));
  const validSignature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('acepta una firma válida', () => {
    expect(
      verifyConduitMessageStatusSignature(body, validSignature, secret),
    ).toBe(true);
  });

  it('rechaza una firma con secreto incorrecto', () => {
    expect(
      verifyConduitMessageStatusSignature(body, validSignature, 'otro-secreto'),
    ).toBe(false);
  });

  it('rechaza si el body fue alterado después de firmar', () => {
    const tampered = Buffer.from(
      JSON.stringify({ event: 'message.sent', extra: true }),
    );
    expect(
      verifyConduitMessageStatusSignature(tampered, validSignature, secret),
    ).toBe(false);
  });

  it('rechaza si no llega ninguna firma', () => {
    expect(verifyConduitMessageStatusSignature(body, undefined, secret)).toBe(
      false,
    );
  });
});
