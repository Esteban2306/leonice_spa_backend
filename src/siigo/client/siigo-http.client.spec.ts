import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SiigoHttpClient } from './siigo-http.client';
import { SiigoError } from './siigo.errors';
import { SiigoSettings } from '../siigo.config';

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown> | null;
}

type Responder = (
  seen: Seen,
  count: number,
) => { status: number; body?: unknown; delayMs?: number };

class FakeSiigoServer {
  readonly seen: Seen[] = [];
  respond: Responder = () => ({ status: 200, body: {} });
  private server!: http.Server;
  baseUrl = '';

  async start() {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const seen: Seen = {
          method: req.method ?? 'GET',
          url: req.url ?? '',
          headers: req.headers,
          body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
        };
        this.seen.push(seen);
        const { status, body, delayMs } = this.respond(seen, this.seen.length);
        setTimeout(() => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(body === undefined ? '' : JSON.stringify(body));
        }, delayMs ?? 0);
      });
    });
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve),
    );
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    this.server.closeAllConnections();
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  get authCalls() {
    return this.seen.filter((s) => s.url === '/auth');
  }
}

const TOKEN_REPLY = {
  status: 200,
  body: { access_token: 'tok-1', expires_in: 86400 },
};

describe('SiigoHttpClient', () => {
  const server = new FakeSiigoServer();
  let settings: SiigoSettings;

  beforeAll(() => server.start());
  afterAll(() => server.stop());

  beforeEach(() => {
    server.seen.length = 0;
    settings = {
      enabled: true,
      baseUrl: server.baseUrl,
      username: 'spa@leonice.test',
      accessKey: 'clave-secreta',
      partnerId: 'LeoniceSpa',
      timeoutMs: 5_000,
    };
  });

  it('se autentica con usuario y llave, y envía Partner-Id, Bearer e Idempotency-Key', async () => {
    server.respond = (seen) =>
      seen.url === '/auth'
        ? TOKEN_REPLY
        : { status: 201, body: { id: 'rc-1', name: 'RC-1-10' } };
    const client = new SiigoHttpClient(settings);

    const result = await client.createVoucher({ type: 'x' }, 'llave30');

    expect(result).toMatchObject({ id: 'rc-1', name: 'RC-1-10' });
    const [auth, voucher] = server.seen;
    expect(auth.body).toEqual({
      username: 'spa@leonice.test',
      access_key: 'clave-secreta',
    });
    expect(auth.headers['partner-id']).toBe('LeoniceSpa');
    expect(voucher.url).toBe('/v1/vouchers');
    expect(voucher.headers.authorization).toBe('Bearer tok-1');
    expect(voucher.headers['partner-id']).toBe('LeoniceSpa');
    expect(voucher.headers['idempotency-key']).toBe('llave30');
    expect(voucher.body).toEqual({ type: 'x' });
  });

  it('reutiliza el token entre llamadas y lo pide una sola vez aunque lleguen juntas', async () => {
    server.respond = (seen) =>
      seen.url === '/auth' ? TOKEN_REPLY : { status: 200, body: [] };
    const client = new SiigoHttpClient(settings);

    await Promise.all([
      client.listPaymentTypes('RC'),
      client.listDocumentTypes('RC'),
      client.listMiscIncomeConcepts(),
    ]);
    await client.listPaymentTypes('RC');

    expect(server.authCalls).toHaveLength(1);
  });

  it('renueva el token una vez cuando Siigo responde 401 y reintenta', async () => {
    let tokens = 0;
    server.respond = (seen) => {
      if (seen.url === '/auth') {
        tokens += 1;
        return { status: 200, body: { access_token: `tok-${tokens}` } };
      }
      return seen.headers.authorization === 'Bearer tok-1'
        ? { status: 401, body: { Errors: [{ Code: 'unauthorized' }] } }
        : { status: 200, body: [] };
    };
    const client = new SiigoHttpClient(settings);

    await expect(client.listPaymentTypes('RC')).resolves.toEqual([]);
    expect(server.authCalls).toHaveLength(2);
  });

  it('un 401 que persiste después de renovar se reporta como AUTH', async () => {
    server.respond = (seen) =>
      seen.url === '/auth'
        ? TOKEN_REPLY
        : { status: 401, body: { Errors: [{ Code: 'unauthorized' }] } };
    const client = new SiigoHttpClient(settings);

    await expect(client.listPaymentTypes('RC')).rejects.toMatchObject({
      kind: 'AUTH',
      retryable: false,
    });
  });

  it('credenciales inválidas en /auth se reportan como AUTH', async () => {
    server.respond = () => ({
      status: 401,
      body: { Errors: [{ Code: 'unauthorized', Message: 'inválido' }] },
    });
    const client = new SiigoHttpClient(settings);

    await expect(client.listPaymentTypes('RC')).rejects.toMatchObject({
      kind: 'AUTH',
    });
  });

  it('traduce un error de validación de Siigo con sus códigos y parámetros', async () => {
    server.respond = (seen) =>
      seen.url === '/auth'
        ? TOKEN_REPLY
        : {
            status: 400,
            body: {
              Status: 400,
              Errors: [
                {
                  Code: 'invalid_total_payments',
                  Message: 'no coincide',
                  Params: ['payments'],
                },
              ],
            },
          };
    const client = new SiigoHttpClient(settings);

    const error = (await client
      .createVoucher({}, 'k')
      .catch((e: unknown) => e)) as SiigoError;

    expect(error).toBeInstanceOf(SiigoError);
    expect(error.kind).toBe('VALIDATION');
    expect(error.retryable).toBe(false);
    expect(error.codes).toEqual(['invalid_total_payments']);
  });

  it('el límite de peticiones y la caída del servicio son reintentables', async () => {
    const client = new SiigoHttpClient(settings);
    server.respond = (seen) =>
      seen.url === '/auth'
        ? TOKEN_REPLY
        : { status: 429, body: { Errors: [{ Code: 'requests_limit' }] } };
    await expect(client.createVoucher({}, 'k')).rejects.toMatchObject({
      kind: 'RATE_LIMIT',
      retryable: true,
    });

    server.respond = (seen) =>
      seen.url === '/auth' ? TOKEN_REPLY : { status: 503 };
    await expect(client.createVoucher({}, 'k')).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      retryable: true,
    });
  });

  it('si Siigo no responde dentro del tiempo límite falla con TIMEOUT reintentable', async () => {
    server.respond = (seen) =>
      seen.url === '/auth' ? TOKEN_REPLY : { status: 200, delayMs: 400 };
    const client = new SiigoHttpClient({ ...settings, timeoutMs: 100 });

    await expect(client.createVoucher({}, 'k')).rejects.toMatchObject({
      kind: 'TIMEOUT',
      retryable: true,
    });
  });

  it('si no hay conexión falla con UNAVAILABLE reintentable', async () => {
    const client = new SiigoHttpClient({
      ...settings,
      baseUrl: 'http://127.0.0.1:1',
    });

    await expect(client.createVoucher({}, 'k')).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      retryable: true,
    });
  });

  it('lee catálogos con los filtros que pide Siigo', async () => {
    server.respond = (seen) =>
      seen.url === '/auth'
        ? TOKEN_REPLY
        : {
            status: 200,
            body: [
              { id: 5, name: 'Efectivo', active: true },
              { id: 6, name: 'Banco', active: false },
            ],
          };
    const client = new SiigoHttpClient(settings);

    const types = await client.listPaymentTypes('RC');

    expect(server.seen[1].url).toBe('/v1/payment-types?document_type=RC');
    expect(types.map((t) => [t.id, t.name, t.active])).toEqual([
      [5, 'Efectivo', true],
      [6, 'Banco', false],
    ]);
  });

  it('busca un producto por código', async () => {
    server.respond = (seen) =>
      seen.url === '/auth'
        ? TOKEN_REPLY
        : {
            status: 200,
            body: { results: [{ id: 'abc', code: 'ALI01', name: 'Alisado' }] },
          };
    const client = new SiigoHttpClient(settings);

    const product = await client.findProductByCode('ALI01');

    expect(server.seen[1].url).toBe('/v1/products?code=ALI01');
    expect(product).toMatchObject({ id: 'abc', code: 'ALI01' });
  });

  it('no escribe la llave de acceso en los errores', async () => {
    server.respond = () => ({
      status: 401,
      body: { Errors: [{ Code: 'unauthorized' }] },
    });
    const client = new SiigoHttpClient(settings);

    const error = (await client
      .listPaymentTypes('RC')
      .catch((e: unknown) => e)) as SiigoError;

    expect(JSON.stringify(error)).not.toContain('clave-secreta');
    expect(error.message).not.toContain('clave-secreta');
  });
});
