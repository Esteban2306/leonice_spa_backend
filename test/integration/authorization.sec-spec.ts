import { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { signCancellationLink } from 'src/reservations/domain/cancellation-link-token';
import {
  ADMIN_EMAIL,
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
import { collectRoutes, RouteInfo, SAMPLE_UUID } from './route-inventory';

const PUBLIC_ALLOW_LIST = [
  'GET /api/v1/auth/google',
  'GET /api/v1/auth/google/callback',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'GET /api/v1/cancellation-links/:token',
  'POST /api/v1/cancellation-links/:token/cancel',
  'GET /api/v1/catalog/products',
  'GET /api/v1/catalog/products/:slug',
  'GET /api/v1/categories',
  'GET /api/v1/categories/:id',
  'GET /api/v1/health',
  'POST /api/v1/integrations/conduit/message-events',
  'GET /api/v1/products',
  'GET /api/v1/products/:id',
  'GET /api/v1/products/:id/related',
  'GET /api/v1/products/categories',
  'GET /api/v1/products/recommendations/:treatmentId',
  'GET /api/v1/products/tags',
  'GET /api/v1/promotions',
  'GET /api/v1/promotions/:id',
  'POST /api/v1/reservations',
  'GET /api/v1/reservations/availability',
  'PATCH /api/v1/reservations/:id/cancel',
  'PATCH /api/v1/reservations/:id/reschedule',
  'POST /api/v1/reservations/:id/deposits',
  'GET /api/v1/showcase/categories',
  'GET /api/v1/showcase/categories/:categorySlug',
  'GET /api/v1/showcase/categories/:categorySlug/treatments/:treatmentSlug',
  'GET /api/v1/treatments',
  'GET /api/v1/treatments/:id',
].sort();

const CONDUIT_TOOL_ALLOW_LIST = [
  'GET /api/v1/conduit/booking/availability',
  'GET /api/v1/conduit/booking/availability/calendar',
  'GET /api/v1/conduit/booking/reservations/upcoming',
  'GET /api/v1/conduit/booking/treatments',
  'GET /api/v1/conduit/business-info',
  'GET /api/v1/deposits/pending',
  'PATCH /api/v1/conduit/clients',
  'POST /api/v1/conduit/booking/reservations',
  'POST /api/v1/conduit/booking/reservations/cancel',
  'POST /api/v1/conduit/booking/reservations/reschedule',
  'POST /api/v1/conduit/clients',
  'POST /api/v1/conduit/handoff',
  'POST /api/v1/deposits/automatic',
  'POST /api/v1/reservations/:id/deposits/automatic',
].sort();

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const key = (r: RouteInfo) => `${r.method} ${r.template}`;

describe('S2. Autorización por rol y por recurso', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let world: World;
  let routes: RouteInfo[];

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    routes = collectRoutes(app);
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

  describe('inventario de endpoints', () => {
    it('solo los endpoints de la lista blanca son públicos (cualquier endpoint público nuevo exige revisión)', () => {
      const publicRoutes = routes
        .filter((r) => r.isPublic && !r.isConduitTool)
        .map(key)
        .sort();
      expect(publicRoutes).toEqual(PUBLIC_ALLOW_LIST);
    });

    it('solo las herramientas del bot de Conduit evitan la sesión, y todas están en la lista revisada', () => {
      const tools = routes
        .filter((r) => r.isConduitTool)
        .map(key)
        .sort();
      expect(tools).toEqual(CONDUIT_TOOL_ALLOW_LIST);
    });

    it('solo existe el rol ADMIN y ningún endpoint declara roles distintos', () => {
      for (const r of routes) {
        if (r.roles)
          expect(r.roles.every((role) => role === 'ADMIN')).toBe(true);
      }
    });

    it('los endpoints que se saltan CSRF son solo públicos o herramientas firmadas', () => {
      const offenders = routes
        .filter((r) => r.skipCsrf && !r.isPublic)
        .map(key);
      expect(offenders).toEqual([]);
    });

    it('todo endpoint no público responde 401 sin sesión (137+ rutas)', async () => {
      const privateRoutes = routes.filter((r) => !r.isPublic);
      expect(privateRoutes.length).toBeGreaterThan(100);
      const failures: string[] = [];
      for (const route of privateRoutes) {
        resetThrottle(app);
        const res = await request(server)
          [route.method.toLowerCase() as 'get'](route.url)
          .send({});
        if (res.status !== 401) failures.push(`${key(route)} → ${res.status}`);
      }
      expect(failures).toEqual([]);
    });

    it('una cookie de acceso falsificada no abre ningún endpoint privado', async () => {
      const privateRoutes = routes.filter((r) => !r.isPublic).slice(0, 40);
      for (const route of privateRoutes) {
        resetThrottle(app);
        const res = await request(server)
          [route.method.toLowerCase() as 'get'](route.url)
          .set('Cookie', 'access_token=falso; csrf_token=x')
          .set('X-CSRF-Token', 'x')
          .send({});
        expect(res.status).toBe(401);
      }
    });

    it('con sesión de administrador ningún endpoint privado responde 401/403 por autorización', async () => {
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      const s = toSession(login.headers['set-cookie']);
      const blocked: string[] = [];
      const safe = routes.filter(
        (r) =>
          !r.isPublic &&
          r.method === 'GET' &&
          !r.template.includes('/admin/conduit') &&
          !r.template.includes('/auth/'),
      );
      for (const route of safe) {
        resetThrottle(app);
        const res = await request(server)
          .get(route.url)
          .set('Cookie', s.cookie);
        if (res.status === 401 || res.status === 403)
          blocked.push(`${key(route)} → ${res.status}`);
      }
      expect(blocked).toEqual([]);
    });
  });

  describe('herramientas del bot (X-API-Key)', () => {
    const tools = () => routes.filter((r) => r.isConduitTool);

    it('sin API key o con una incorrecta responden 401', async () => {
      for (const route of tools()) {
        resetThrottle(app);
        const missing = await request(server)
          [route.method.toLowerCase() as 'get'](route.url)
          .send({});
        expect(missing.status).toBe(401);
        const wrong = await request(server)
          [route.method.toLowerCase() as 'get'](route.url)
          .set('X-API-Key', 'clave-incorrecta')
          .send({});
        expect(wrong.status).toBe(401);
      }
    });

    it('una sesión de administrador (JWT) no sustituye a la API key', async () => {
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      const s = toSession(login.headers['set-cookie']);
      const res = await request(server)
        .get('/api/v1/conduit/booking/treatments')
        .set('Cookie', s.cookie);
      expect(res.status).toBe(401);
    });

    it('con API key válida el teléfono verificado del chat prevalece sobre el que escriba el modelo', async () => {
      const apiKey = process.env.CONDUIT_TOOL_API_KEY;
      if (!apiKey) return;
      const owner = newClientDto('dueño');
      const created = await app.get(CreateReservationOrchestrator).execute({
        client: owner,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(10, 10).toISOString(),
      });
      const res = await request(server)
        .post('/api/v1/conduit/booking/reservations/cancel')
        .set('X-API-Key', apiKey)
        .set('X-Conduit-Contact-Phone', '+573009998877')
        .send({
          phone: owner.phone,
          reservationId: created.reservations[0].id,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const row = await prisma.client.reservation.findUniqueOrThrow({
        where: { id: created.reservations[0].id },
      });
      expect(row.status).toBe('PENDIENTE_DEPOSITO');
    });

    it('un chat identificado solo por LID no puede operar sobre clientes existentes', async () => {
      const apiKey = process.env.CONDUIT_TOOL_API_KEY;
      if (!apiKey) return;
      const res = await request(server)
        .get('/api/v1/deposits/pending')
        .query({ phone: '+573001112233' })
        .set('X-API-Key', apiKey)
        .set('X-Conduit-Contact-Lid', '123@lid');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('propiedad del recurso en endpoints públicos', () => {
    const book = async (day: number) => {
      const client = newClientDto('prop');
      const result = await app.get(CreateReservationOrchestrator).execute({
        client,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(day, 10).toISOString(),
      });
      return { client, reservation: result.reservations[0] };
    };

    it('cancelar con el teléfono de otra persona falla y no modifica la reserva', async () => {
      const { reservation } = await book(11);
      const res = await request(server)
        .patch(`/api/v1/reservations/${reservation.id}/cancel`)
        .send({ phone: '+573004445566' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      const row = await prisma.client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(row.status).toBe('PENDIENTE_DEPOSITO');
    });

    it('reagendar con el teléfono de otra persona responde 403 y no cambia el horario', async () => {
      const { reservation } = await book(12);
      const res = await request(server)
        .patch(`/api/v1/reservations/${reservation.id}/reschedule`)
        .send({
          phone: '+573004445566',
          newScheduledStart: futureSlot(13, 14).toISOString(),
        });
      expect(res.status).toBe(403);
      const row = await prisma.client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(row.scheduledStart.getTime()).toBe(
        reservation.scheduledStart.getTime(),
      );
    });

    it('subir comprobante con el teléfono de otra persona responde 403 y no guarda nada', async () => {
      const { reservation } = await book(14);
      const res = await request(server)
        .post(`/api/v1/reservations/${reservation.id}/deposits`)
        .field('phone', '+573004445566')
        .attach('image', PNG_1X1, {
          filename: 'p.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(403);
      expect(
        await prisma.client.depositRecord.count({
          where: { reservationId: reservation.id },
        }),
      ).toBe(0);
    });

    it('ver o cancelar con un enlace manipulado, firmado con otra clave o vencido es rechazado', async () => {
      const { client, reservation } = await book(15);
      const clientRow = await prisma.client.client.findUniqueOrThrow({
        where: { phone: client.phone },
      });
      const secret = createHmac('sha256', process.env.JWT_SECRET as string)
        .update('cancellation-link-v1')
        .digest('hex');
      const valid = signCancellationLink(secret, {
        clientId: clientRow.id,
        reservationId: reservation.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      const foreign = signCancellationLink(
        'otra-clave-de-al-menos-32-caracteres!!',
        {
          clientId: clientRow.id,
          reservationId: reservation.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      );
      const expired = signCancellationLink(secret, {
        clientId: clientRow.id,
        reservationId: reservation.id,
        expiresAt: new Date(Date.now() - 1000),
      });
      const wrongClient = signCancellationLink(secret, {
        clientId: SAMPLE_UUID,
        reservationId: reservation.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      const tampered = `${valid.split('.')[0]}x.${valid.split('.')[1]}`;

      for (const token of [
        foreign,
        expired,
        wrongClient,
        tampered,
        'basura',
        `${valid}.extra`,
      ]) {
        const view = await request(server).get(
          `/api/v1/cancellation-links/${token}`,
        );
        expect([400, 401, 403, 404, 409, 410]).toContain(view.status);
        const cancel = await request(server)
          .post(`/api/v1/cancellation-links/${token}/cancel`)
          .send({ scope: 'SINGLE', reservationId: reservation.id });
        expect(cancel.status).toBeGreaterThanOrEqual(400);
      }
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe('PENDIENTE_DEPOSITO');

      const ok = await request(server).get(
        `/api/v1/cancellation-links/${valid}`,
      );
      expect(ok.status).toBe(200);
    });

    it('un enlace de una cliente no permite cancelar la reserva de otra', async () => {
      const a = await book(16);
      const b = await book(17);
      const clientA = await prisma.client.client.findUniqueOrThrow({
        where: { phone: a.client.phone },
      });
      const secret = createHmac('sha256', process.env.JWT_SECRET as string)
        .update('cancellation-link-v1')
        .digest('hex');
      const tokenA = signCancellationLink(secret, {
        clientId: clientA.id,
        reservationId: a.reservation.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      const res = await request(server)
        .post(`/api/v1/cancellation-links/${tokenA}/cancel`)
        .send({ scope: 'SINGLE', reservationId: b.reservation.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: b.reservation.id },
          })
        ).status,
      ).toBe('PENDIENTE_DEPOSITO');
    });
  });

  describe('exposición de datos personales por endpoints anónimos', () => {
    const anonPost = (path: string, body: object) =>
      request(server)
        .post(path)
        .set('Cookie', 'csrf_token=anon')
        .set('X-CSRF-Token', 'anon')
        .send(body);

    const registered = async (label: string, day: number) => {
      const client = newClientDto(label);
      await app.get(CreateReservationOrchestrator).execute({
        client,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(day, 10).toISOString(),
      });
      return client;
    };

    const adminSession = async () => {
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      return toSession(login.headers['set-cookie']);
    };

    it('POST /clients/resolve exige sesión de administrador y no revela el nombre a un anónimo', async () => {
      const victim = await registered('victima', 18);
      const res = await anonPost('/api/v1/clients/resolve', {
        phone: victim.phone,
      });
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(victim.name);
    });

    it('el administrador sigue pudiendo resolver clientes por teléfono', async () => {
      const victim = await registered('admin-resolve', 23);
      const s = await adminSession();
      const res = await request(server)
        .post('/api/v1/clients/resolve')
        .set('Cookie', s.cookie)
        .set('X-CSRF-Token', s.csrf)
        .send({ phone: victim.phone });
      expect(res.status).toBe(201);
      expect(bodyOf(res).name).toBe(victim.name);
    });

    it('un anónimo no puede asociar su whatsappJid ni datos de salud a la ficha de otra persona (ni por /clients/resolve ni reservando)', async () => {
      const victim = await registered('victima-jid', 19);
      await anonPost('/api/v1/clients/resolve', {
        phone: victim.phone,
        whatsappJid: 'atacante@s.whatsapp.net',
      });
      const booking = await request(server)
        .post('/api/v1/reservations')
        .send({
          client: {
            phone: victim.phone,
            whatsappJid: 'atacante@s.whatsapp.net',
            allergies: 'inventada',
            isPregnant: true,
            consent: { healthDataConsent: true, policyVersion: 'v1' },
          },
          treatments: [world.tertiary.treatmentId],
          scheduledStart: futureSlot(24, 10).toISOString(),
        });
      expect(booking.status).toBeLessThan(500);
      const row = await prisma.client.client.findUniqueOrThrow({
        where: { phone: victim.phone },
      });
      expect(row.whatsappJid).toBeNull();
      expect(row.allergies).toBeNull();
      expect(row.isPregnant).toBe(false);
    });

    it('un whatsappJid enviado por un anónimo no sirve para suplantar a otra clienta al reservar', async () => {
      const victim = await registered('victima-jid-lookup', 26);
      await prisma.client.client.update({
        where: { phone: victim.phone },
        data: { whatsappJid: 'victima@s.whatsapp.net' },
      });
      const attacker = newClientDto('atacante');
      const res = await request(server)
        .post('/api/v1/reservations')
        .send({
          client: { ...attacker, whatsappJid: 'victima@s.whatsapp.net' },
          treatments: [world.tertiary.treatmentId],
          scheduledStart: futureSlot(27, 10).toISOString(),
        });
      expect(res.status).toBe(201);
      const victimRow = await prisma.client.client.findUniqueOrThrow({
        where: { phone: victim.phone },
      });
      const reservations = await prisma.client.reservation.findMany({
        where: { clientId: victimRow.id },
      });
      expect(
        reservations.every(
          (r) => r.scheduledStart.getTime() !== futureSlot(27, 10).getTime(),
        ),
      ).toBe(true);
    });

    it('un anónimo no puede saber si un teléfono es cliente: /clients/resolve responde igual para registrados y desconocidos', async () => {
      const known = await registered('conocida', 21);
      const knownRes = await anonPost('/api/v1/clients/resolve', {
        phone: known.phone,
      });
      const unknownRes = await anonPost('/api/v1/clients/resolve', {
        phone: newClientDto('desconocida').phone,
      });
      expect(knownRes.status).toBe(unknownRes.status);
    });

    it('un anónimo no puede saber si un teléfono es cliente: /products/recommended-for-client responde igual', async () => {
      const known = await registered('conocida-rec', 22);
      const knownRes = await request(server)
        .get('/api/v1/products/recommended-for-client')
        .query({ phone: known.phone });
      const unknownRes = await request(server)
        .get('/api/v1/products/recommended-for-client')
        .query({ phone: newClientDto('desconocida-rec').phone });
      expect(knownRes.status).toBe(unknownRes.status);
      expect(knownRes.status).toBe(401);
    });

    it('POST /products/:id/view no permite a un anónimo escribir historial en nombre de otra persona', async () => {
      const victim = await registered('vista', 20);
      const product = await prisma.client.product.create({
        data: {
          name: 'Producto vista',
          slug: `producto-vista-${Date.now()}`,
          category: {
            create: { name: `Cat ${Date.now()}`, slug: `cat-${Date.now()}` },
          },
        },
      });
      const res = await request(server)
        .post(`/api/v1/products/${product.id}/view`)
        .send({ phone: victim.phone });
      expect(res.status).toBe(401);
      const client = await prisma.client.client.findUniqueOrThrow({
        where: { phone: victim.phone },
      });
      expect(
        await prisma.client.productViewLog.count({
          where: { clientId: client.id },
        }),
      ).toBe(0);
    });

    it('las respuestas públicas de catálogo no incluyen campos internos ni datos de personas', async () => {
      for (const path of [
        '/treatments',
        '/categories',
        '/products',
        '/promotions',
        '/showcase/categories',
        '/catalog/products',
      ]) {
        const res = await request(server).get(`/api/v1${path}`);
        expect(res.status).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(
          /passwordHash|refreshTokenHash|allergies|birthDate|creditBalance|"phone"/i,
        );
      }
    });
  });
});
