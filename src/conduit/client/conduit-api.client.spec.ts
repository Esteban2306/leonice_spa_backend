import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { ConduitApiClient } from './conduit-api.client';
import { conduitIdempotencyKey } from './conduit-idempotency-key';
import { assertMessageDelivered } from '../../automation/utils/assert-message-delivered';
import { RetryableInfrastructureException } from '../../common/exceptions/retryable-infrastructure.exception';

const config = {
  get: (key: string, fallback?: string) =>
    ({ CONDUIT_BASE_URL: 'http://conduit.test', CONDUIT_API_KEY: 'k' })[key] ??
    fallback,
  getOrThrow: () => 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
} as unknown as ConfigService;

const params = {
  phone: '+573001234567',
  templateId: 'tpl',
  variables: { nombre: 'Ana' },
  idempotencyKey: 'leonice-abc123:CLIENT_RESCHEDULED',
  companyEventId: 'notify-client-rescheduled:42',
};

function respond(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('ConduitApiClient.sendWhatsappMessage', () => {
  const client = new ConduitApiClient(config);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('envía Idempotency-Key y meta.companyEventId', async () => {
    const fetchMock = respond(201, { messageId: 'm1', status: 'QUEUED' });
    global.fetch = fetchMock;

    const result = await client.sendWhatsappMessage(params);

    expect(result).toEqual({ delivered: true, messageId: 'm1' });
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(init.headers['Idempotency-Key']).toBe(params.idempotencyKey);
    expect((JSON.parse(init.body) as { meta: unknown }).meta).toEqual({
      companyEventId: params.companyEventId,
    });
  });

  it('un 400 es permanente y no se reintenta', async () => {
    global.fetch = respond(400, { message: 'número inválido' });

    const result = await client.sendWhatsappMessage(params);

    expect(result.delivered).toBe(false);
    expect(result.permanent).toBe(true);
    expect(() => assertMessageDelivered(result)).toThrow(UnrecoverableError);
  });

  it('muchos 4xx seguidos no abren el circuito', async () => {
    global.fetch = respond(400, { message: 'número inválido' });
    for (let i = 0; i < 6; i++) await client.sendWhatsappMessage(params);

    global.fetch = respond(201, { messageId: 'm2' });
    await expect(client.sendWhatsappMessage(params)).resolves.toEqual({
      delivered: true,
      messageId: 'm2',
    });
  });

  it('un 503 es transitorio: se reintenta', async () => {
    global.fetch = respond(503, { message: 'caído' });

    const result = await client.sendWhatsappMessage(params);

    expect(result.permanent).toBeUndefined();
    expect(() => assertMessageDelivered(result)).toThrow(
      RetryableInfrastructureException,
    );
  });
});

describe('conduitIdempotencyKey', () => {
  it('es estable para el mismo job y cumple el formato de Conduit', () => {
    const job = { queueName: 'automation-communications', id: '123' };
    const key = conduitIdempotencyKey(job);

    expect(key).toBe(conduitIdempotencyKey({ ...job }));
    expect(key).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(`${key}:CLIENT_CANCELLATION_CONFIRMED`.length).toBeLessThanOrEqual(
      128,
    );
  });

  it('cambia entre jobs distintos', () => {
    expect(conduitIdempotencyKey({ queueName: 'q', id: '1' })).not.toBe(
      conduitIdempotencyKey({ queueName: 'q', id: '2' }),
    );
  });
});
