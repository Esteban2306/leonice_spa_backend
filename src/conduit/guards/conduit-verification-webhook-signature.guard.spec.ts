import { createHmac } from 'node:crypto';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConduitVerificationWebhookSignatureGuard } from './conduit-verification-webhook-signature.guard';
import { ConduitWebhookSignatureGuard } from './conduit-webhook-signature.guard';

const body = Buffer.from('{"event":"verification.invalid"}');

function sign(secret: string, timestamp: string) {
  return `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex')}`;
}

function context(headers: Record<string, string>, rawBody: Buffer | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, rawBody }) }),
  } as unknown as ExecutionContext;
}

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as never;

const now = () => String(Math.floor(Date.now() / 1000));

describe('firma del webhook de verificación', () => {
  it('acepta la firma hecha con su propio secreto', () => {
    const ts = now();
    const guard = new ConduitVerificationWebhookSignatureGuard(
      config({
        CONDUIT_VERIFICATION_WEBHOOK_SECRET: 'verificacion',
        CONDUIT_WEBHOOK_SECRET: 'entregas',
      }),
    );

    expect(
      guard.canActivate(
        context(
          {
            'x-conduit-signature-v2': sign('verificacion', ts),
            'x-conduit-timestamp': ts,
          },
          body,
        ),
      ),
    ).toBe(true);
  });

  it('rechaza una firma hecha con el secreto del webhook de entregas', () => {
    const ts = now();
    const guard = new ConduitVerificationWebhookSignatureGuard(
      config({
        CONDUIT_VERIFICATION_WEBHOOK_SECRET: 'verificacion',
        CONDUIT_WEBHOOK_SECRET: 'entregas',
      }),
    );

    expect(() =>
      guard.canActivate(
        context(
          {
            'x-conduit-signature-v2': sign('entregas', ts),
            'x-conduit-timestamp': ts,
          },
          body,
        ),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('sin el secreto configurado rechaza en vez de caer en un error 500', () => {
    const ts = now();
    const guard = new ConduitVerificationWebhookSignatureGuard(
      config({ CONDUIT_WEBHOOK_SECRET: 'entregas' }),
    );

    expect(() =>
      guard.canActivate(
        context(
          {
            'x-conduit-signature-v2': sign('entregas', ts),
            'x-conduit-timestamp': ts,
          },
          body,
        ),
      ),
    ).toThrow(/CONDUIT_VERIFICATION_WEBHOOK_SECRET/);
  });

  it('rechaza un mensaje viejo aunque la firma sea correcta', () => {
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    const guard = new ConduitVerificationWebhookSignatureGuard(
      config({ CONDUIT_VERIFICATION_WEBHOOK_SECRET: 'verificacion' }),
    );

    expect(() =>
      guard.canActivate(
        context(
          {
            'x-conduit-signature-v2': sign('verificacion', ts),
            'x-conduit-timestamp': ts,
          },
          body,
        ),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('el webhook de entregas sigue usando CONDUIT_WEBHOOK_SECRET', () => {
    const ts = now();
    const guard = new ConduitWebhookSignatureGuard(
      config({
        CONDUIT_WEBHOOK_SECRET: 'entregas',
        CONDUIT_VERIFICATION_WEBHOOK_SECRET: 'verificacion',
      }),
    );

    expect(
      guard.canActivate(
        context(
          {
            'x-conduit-signature-v2': sign('entregas', ts),
            'x-conduit-timestamp': ts,
          },
          body,
        ),
      ),
    ).toBe(true);
  });
});
