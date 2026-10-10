import { createHmac } from 'node:crypto';
import {
  verifyConduitMessageStatusSignature,
  verifyConduitMessageStatusSignatureV2,
} from './verify-conduit-signature';

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

describe('verifyConduitMessageStatusSignatureV2', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ event: 'message.sent' }));
  const now = Date.UTC(2026, 9, 11, 15, 0, 0);
  const ts = String(Math.floor(now / 1000));
  const sign = (timestamp: string) =>
    `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')}`;

  it('acepta una firma con timestamp vigente', () => {
    expect(
      verifyConduitMessageStatusSignatureV2(body, sign(ts), ts, secret, now),
    ).toBe(true);
  });

  it('rechaza un reenvío pasada la ventana de 5 minutos', () => {
    expect(
      verifyConduitMessageStatusSignatureV2(
        body,
        sign(ts),
        ts,
        secret,
        now + 301_000,
      ),
    ).toBe(false);
  });

  it('rechaza si se cambia el timestamp para "refrescar" una captura', () => {
    const newer = String(Number(ts) + 200);
    expect(
      verifyConduitMessageStatusSignatureV2(
        body,
        sign(ts),
        newer,
        secret,
        now + 200_000,
      ),
    ).toBe(false);
  });

  it('rechaza sin timestamp', () => {
    expect(
      verifyConduitMessageStatusSignatureV2(body, sign(ts), undefined, secret),
    ).toBe(false);
  });
});
