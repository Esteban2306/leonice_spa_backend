import { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  ADMIN_EMAIL,
  breakThrottleStorage,
  bodyOf,
  ADMIN_PASSWORD,
  createSecurityApp,
  HttpServer,
  resetDatabase,
  resetThrottle,
  seedAdmin,
  toSession,
} from './app-harness';
import { futureSlot, newClientDto, seedWorld, World } from './harness';

const API = '/api/v1';

describe('S3. Rate limiting para anónimos, clientes, administradores y webhooks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let world: World;

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    await seedAdmin(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
  });

  const statuses = async (
    count: number,
    send: (index: number) => request.Test,
  ) => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((await send(i)).status);
    return out;
  };

  describe('anónimos', () => {
    it('el login se limita a 5 intentos por minuto y responde 429 con el formato de error estándar', async () => {
      const codes = await statuses(7, () =>
        request(server)
          .post(`${API}/auth/login`)
          .send({ email: 'nadie@leonice.test', password: 'incorrecta' }),
      );
      expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(codes.slice(5)).toEqual([429, 429]);

      const blocked = await request(server)
        .post(`${API}/auth/login`)
        .send({ email: 'nadie@leonice.test', password: 'incorrecta' });
      expect(bodyOf(blocked).code).toBe('RATE_LIMITED');
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('rotar la cabecera X-Forwarded-For no evita el límite del login', async () => {
      const codes = await statuses(8, (i) =>
        request(server)
          .post(`${API}/auth/login`)
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'nadie@leonice.test', password: 'incorrecta' }),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(3);
    });

    it('el endpoint de disponibilidad se limita (10 por 10 s)', async () => {
      const codes = await statuses(14, () =>
        request(server).get(`${API}/reservations/availability`),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    });

    it('una ráfaga general de lecturas públicas termina limitada por el tope por defecto', async () => {
      const codes = await statuses(130, () =>
        request(server).get(`${API}/treatments`),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
      expect(codes.slice(0, 50).every((c) => c === 200)).toBe(true);
    });

    it('cancelar y reagendar públicos se limitan a 10 por minuto', async () => {
      const cancel = await statuses(13, () =>
        request(server)
          .patch(
            `${API}/reservations/00000000-0000-4000-8000-000000000001/cancel`,
          )
          .send({ phone: '+573001112233' }),
      );
      expect(cancel.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    });

    it('un token administrador falsificado no obtiene la exención de límites', async () => {
      const codes = await statuses(130, () =>
        request(server)
          .get(`${API}/treatments`)
          .set('Cookie', 'access_token=falso'),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resiliencia del almacén de límites', () => {
    it('si el almacén de límites (Redis) falla, la API pública sigue respondiendo en lugar de caer con 500', async () => {
      const restore = breakThrottleStorage();
      try {
        const res = await request(server).get(`${API}/treatments`);
        expect(res.status).toBe(200);
      } finally {
        restore();
      }
    });

    it('con Redis caído los límites se siguen aplicando en memoria (no queda abierta la puerta)', async () => {
      const restore = breakThrottleStorage();
      try {
        const codes = await statuses(8, () =>
          request(server)
            .post(`${API}/auth/login`)
            .send({ email: 'nadie@leonice.test', password: 'incorrecta' }),
        );
        expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
      } finally {
        restore();
      }
    });
  });

  describe('clientes (identificados por teléfono)', () => {
    const booking = (phone: string, day: number) =>
      request(server)
        .post(`${API}/reservations`)
        .send({
          client: { phone, name: 'Cliente Límite', birthDate: '1990-01-01' },
          treatments: [world.secondary.treatmentId],
          scheduledStart: futureSlot(day, 10).toISOString(),
        });

    it('el mismo teléfono no puede crear reservas sin límite', async () => {
      const phone = newClientDto('limite').phone;
      const codes = await statuses(9, (i) => booking(phone, 3 + i));
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    });

    it('un mismo origen no puede evadir el límite cambiando el teléfono en cada petición', async () => {
      const codes = await statuses(20, (i) =>
        booking(newClientDto(`rota${i}`).phone, 30 + i),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('administradores y herramientas del bot', () => {
    it('el administrador autenticado queda exento de los límites (diseño) pero sigue necesitando sesión válida', async () => {
      const login = await request(server)
        .post(`${API}/auth/login`)
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      const s = toSession(login.headers['set-cookie']);
      const codes = await statuses(130, () =>
        request(server).get(`${API}/business-settings`).set('Cookie', s.cookie),
      );
      expect(codes.every((c) => c === 200)).toBe(true);
    });

    it('una API key incorrecta no obtiene la exención de límites del bot', async () => {
      const codes = await statuses(130, () =>
        request(server)
          .get(`${API}/conduit/booking/treatments`)
          .set('X-API-Key', 'clave-incorrecta'),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('webhooks de Conduit', () => {
    const secret = process.env.CONDUIT_WEBHOOK_SECRET as string;
    const body = JSON.stringify({
      event: 'message.sent',
      timestamp: new Date().toISOString(),
      data: {},
    });
    const sign = (payload: string, ts: number) =>
      `sha256=${createHmac('sha256', secret).update(`${ts}.`).update(payload).digest('hex')}`;
    const post = (headers: Record<string, string>, payload = body) =>
      request(server)
        .post(`${API}/integrations/conduit/message-events`)
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(payload);

    it('sin firma, con firma incorrecta o con la firma antigua (V1) responde 401', async () => {
      const ts = Math.floor(Date.now() / 1000);
      expect((await post({})).status).toBe(401);
      expect(
        (
          await post({
            'X-Conduit-Signature-V2': 'sha256=00',
            'X-Conduit-Timestamp': String(ts),
          })
        ).status,
      ).toBe(401);
      const v1 = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
      expect((await post({ 'X-Conduit-Signature': v1 })).status).toBe(401);
    });

    it('rechaza una firma válida con marca de tiempo fuera de la ventana de 5 minutos (reenvío de captura)', async () => {
      const old = Math.floor(Date.now() / 1000) - 10 * 60;
      const res = await post({
        'X-Conduit-Signature-V2': sign(body, old),
        'X-Conduit-Timestamp': String(old),
      });
      expect(res.status).toBe(401);
      const future = Math.floor(Date.now() / 1000) + 10 * 60;
      expect(
        (
          await post({
            'X-Conduit-Signature-V2': sign(body, future),
            'X-Conduit-Timestamp': String(future),
          })
        ).status,
      ).toBe(401);
    });

    it('rechaza una firma válida si el cuerpo fue alterado', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const res = await post(
        {
          'X-Conduit-Signature-V2': sign(body, ts),
          'X-Conduit-Timestamp': String(ts),
        },
        body.replace('message.sent', 'message.read'),
      );
      expect(res.status).toBe(401);
    });

    it('con firma V2 válida pasa la barrera de firma (no responde 401)', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const res = await post({
        'X-Conduit-Signature-V2': sign(body, ts),
        'X-Conduit-Timestamp': String(ts),
      });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('los webhooks legítimos con firma válida no quedan limitados por el tope de reservas de clientes (25 seguidos)', async () => {
      const codes = await statuses(25, () => {
        const ts = Math.floor(Date.now() / 1000);
        return request(server)
          .post(`${API}/integrations/conduit/message-events`)
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature-V2', sign(body, ts))
          .set('X-Conduit-Timestamp', String(ts))
          .send(body);
      });
      expect(codes.filter((c) => c === 429)).toHaveLength(0);
    });

    it('una avalancha de firmas inválidas termina frenada con 429 (tope por segundo de webhooks)', async () => {
      const codes = await statuses(80, () =>
        request(server)
          .post(`${API}/integrations/conduit/message-events`)
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature-V2', 'sha256=00')
          .set('X-Conduit-Timestamp', String(Math.floor(Date.now() / 1000)))
          .send(body),
      );
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
      expect(codes.every((c) => c === 401 || c === 429)).toBe(true);
    });

    it('el listado de eventos de mensajes exige sesión de administrador', async () => {
      const res = await request(server).get(
        `${API}/integrations/conduit/message-events`,
      );
      expect(res.status).toBe(401);
    });
  });
});
