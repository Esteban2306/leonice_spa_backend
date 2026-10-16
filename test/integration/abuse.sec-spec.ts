import { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import {
  ADMIN_EMAIL,
  bodyOf,
  ADMIN_PASSWORD,
  createSecurityApp,
  HttpServer,
  resetDatabase,
  resetThrottle,
  seedAdmin,
  Session,
  toSession,
} from './app-harness';
import { futureSlot, newClientDto, seedWorld, World } from './harness';

const API = '/api/v1';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);
const anon = { cookie: 'csrf_token=anon', csrf: 'anon' };

describe('S5. Validación de DTO, límites, archivos y abuso', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let world: World;
  let admin: Session;

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    await seedAdmin(prisma);
    const login = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    admin = toSession(login.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
  });

  const anonPost = (path: string, body: object) =>
    request(server)
      .post(`${API}${path}`)
      .set('Cookie', anon.cookie)
      .set('X-CSRF-Token', anon.csrf)
      .send(body);

  const adminReq = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
  ) =>
    request(server)
      [method](`${API}${path}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  const validBooking = (overrides: Record<string, unknown> = {}) => ({
    client: {
      phone: newClientDto('abuso').phone,
      name: 'Abuso',
      birthDate: '1990-01-01',
    },
    treatments: [world.secondary.treatmentId],
    scheduledStart: futureSlot(10, 10).toISOString(),
    ...overrides,
  });

  describe('DTO', () => {
    it('rechaza propiedades desconocidas (whitelist estricta) en endpoints públicos', async () => {
      const res = await request(server)
        .post(`${API}/reservations`)
        .send(
          validBooking({ isAdmin: true, status: 'CONFIRMADA', finalPrice: 0 }),
        );
      expect(res.status).toBe(400);
      expect(bodyOf(res).code).toBe('VALIDATION_FAILED');
    });

    it('rechaza tipos incorrectos, nulos y estructuras anidadas inesperadas', async () => {
      const bodies = [
        validBooking({ treatments: 'no-es-arreglo' }),
        validBooking({ treatments: [123] }),
        validBooking({ treatments: [] }),
        validBooking({ scheduledStart: 'ayer' }),
        validBooking({ scheduledStart: null }),
        validBooking({ client: 'texto' }),
        validBooking({ client: { phone: { $gt: '' } } }),
        validBooking({ channel: 'FAX' }),
      ];
      for (const body of bodies) {
        const res = await request(server)
          .post(`${API}/reservations`)
          .send(body);
        expect(res.status).toBe(400);
        resetThrottle(app);
      }
    });

    it('un cuerpo con __proto__ o constructor no contamina objetos ni provoca errores 500', async () => {
      const raw = `{"client":{"phone":"3001112233","__proto__":{"isAdmin":true}},"treatments":["${world.secondary.treatmentId}"],"scheduledStart":"${futureSlot(10, 10).toISOString()}","constructor":{"prototype":{"polluted":true}}}`;
      const res = await request(server)
        .post(`${API}/reservations`)
        .set('Content-Type', 'application/json')
        .send(raw);
      expect(res.status).toBeLessThan(500);
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('JSON malformado responde 400 sin filtrar el parser', async () => {
      const res = await request(server)
        .post(`${API}/reservations`)
        .set('Content-Type', 'application/json')
        .send('{"client": {');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(
        /SyntaxError|Unexpected|at \w+/,
      );
    });

    it('parámetros de ruta no UUID responden 400 y no llegan a la base de datos', async () => {
      for (const path of [
        '/reservations/no-uuid',
        '/clients/1;DROP TABLE clients',
        '/products/admin/%27%20OR%201=1',
      ]) {
        const res = await adminReq('get', path);
        expect(res.status).toBe(400);
      }
    });

    it('las cadenas de inyección SQL/NoSQL en búsquedas se tratan como datos', async () => {
      for (const q of [
        "' OR 1=1 --",
        '"; DROP TABLE clients; --',
        '{"$ne":null}',
        '%',
        '_',
      ]) {
        const res = await adminReq('get', '/clients').query({ q });
        expect(res.status).toBeLessThan(500);
      }
      expect(await prisma.client.client.count()).toBeGreaterThanOrEqual(0);
    });

    it('la paginación tiene tope y rechaza valores absurdos', async () => {
      expect(
        (await adminReq('get', '/clients').query({ pageSize: 100000 })).status,
      ).toBe(400);
      expect(
        (await adminReq('get', '/clients').query({ page: -1 })).status,
      ).toBe(400);
      expect(
        (await adminReq('get', '/clients').query({ page: 'abc' })).status,
      ).toBe(400);
    });

    it('la clave de idempotencia con formato inválido se rechaza', async () => {
      const res = await request(server)
        .post(`${API}/reservations`)
        .set('Idempotency-Key', 'x'.repeat(500))
        .send(validBooking());
      expect(res.status).toBe(400);
    });
  });

  describe('límites de tamaño en endpoints anónimos', () => {
    it('un nombre de cliente descomunal se rechaza con validación (no se acepta ni se procesa)', async () => {
      const res = await anonPost('/clients/resolve', {
        phone: newClientDto('grande').phone,
        name: 'A'.repeat(200_000),
        birthDate: '1990-01-01',
      });
      expect(res.status).toBe(400);
    });

    it('alergias descomunales se rechazan', async () => {
      const res = await anonPost('/clients/resolve', {
        phone: newClientDto('alergia').phone,
        name: 'Cliente',
        birthDate: '1990-01-01',
        allergies: 'x'.repeat(200_000),
        consent: { healthDataConsent: true, policyVersion: 'v1' },
      });
      expect(res.status).toBe(400);
    });

    it('un arreglo gigante de tratamientos se rechaza antes de consultar la base', async () => {
      const ids = Array.from(
        { length: 5000 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      );
      const res = await request(server)
        .post(`${API}/reservations`)
        .send(validBooking({ treatments: ids }));
      expect(res.status).toBe(400);
      expect(bodyOf(res).code).toBe('VALIDATION_FAILED');
    });

    it('un cuerpo anónimo de 1 MB se rechaza con 413 (el límite global de 10 MB es excesivo para endpoints públicos)', async () => {
      const res = await request(server)
        .post(`${API}/reservations`)
        .send(validBooking({ padding: 'x'.repeat(1_000_000) }));
      expect(res.status).toBe(413);
    });

    it('un cuerpo de más de 10 MB se rechaza con 413', async () => {
      const res = await request(server)
        .post(`${API}/reservations`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ padding: 'x'.repeat(11 * 1024 * 1024) }));
      expect(res.status).toBe(413);
    });
  });

  describe('archivos', () => {
    let reservationId: string;
    let phone: string;

    beforeAll(async () => {
      const client = newClientDto('archivo');
      phone = client.phone;
      const created = await app.get(CreateReservationOrchestrator).execute({
        client,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(20, 10).toISOString(),
      });
      reservationId = created.reservations[0].id;
    });

    const upload = (
      buffer: Buffer | null,
      options: { filename?: string; contentType?: string; field?: string } = {},
    ) => {
      const req = request(server)
        .post(`${API}/reservations/${reservationId}/deposits`)
        .field('phone', phone);
      if (buffer) {
        req.attach(options.field ?? 'image', buffer, {
          filename: options.filename ?? 'comprobante.png',
          contentType: options.contentType ?? 'image/png',
        });
      }
      return req;
    };

    it('acepta una imagen válida y la deja pendiente de revisión', async () => {
      const res = await upload(PNG);
      expect(res.status).toBe(201);
      expect(bodyOf(res).status).toBe('PENDIENTE');
    });

    it('rechaza peticiones sin archivo o con el campo equivocado', async () => {
      expect((await upload(null)).status).toBe(400);
      expect(
        (await upload(PNG, { field: 'archivo' })).status,
      ).toBeGreaterThanOrEqual(400);
    });

    it('rechaza un archivo que supera 8 MB', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]);
      const res = await upload(big);
      expect([400, 413]).toContain(res.status);
    });

    it('rechaza texto, HTML, SVG y ejecutables aunque declaren Content-Type de imagen (verificación por firma real, librería file-type)', () => {
      const output = execFileSync(
        process.execPath,
        [
          '-e',
          `
          const { FileTypeValidator } = require('@nestjs/common');
          const v = new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ });
          const png = Buffer.from('${PNG.toString('base64')}', 'base64');
          const cases = {
            png: [png, 'image/png'],
            texto: [Buffer.from('hola mundo'), 'image/png'],
            html: [Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'],
            svg: [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png'],
            exe: [Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]), 'image/png'],
            gif: [Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'), 'image/gif'],
            pngMimeTexto: [png, 'text/plain'],
          };
          (async () => {
            const out = {};
            for (const [name, [buffer, mimetype]] of Object.entries(cases)) {
              out[name] = await v.isValid({ buffer, mimetype, originalname: 'x' });
            }
            console.log(JSON.stringify(out));
          })();
        `,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      const result = JSON.parse(
        output.trim().split('\n').pop() as string,
      ) as Record<string, boolean>;
      expect(result).toEqual({
        png: true,
        texto: false,
        html: false,
        svg: false,
        exe: false,
        gif: false,
        pngMimeTexto: true,
      });
    });

    it('los administradores suben imágenes de producto con los mismos controles de tipo y tamaño', async () => {
      const category = await prisma.client.productCategory.create({
        data: { name: `Cat ${Date.now()}`, slug: `cat-${Date.now()}` },
      });
      const product = await prisma.client.product.create({
        data: {
          name: 'P',
          slug: `p-${Date.now()}`,
          productCategoryId: category.id,
          variants: { create: { brand: 'M', presentation: '1', price: 10 } },
        },
        include: { variants: true },
      });
      const variantId = product.variants[0].id;
      const res = await request(server)
        .post(`${API}/products/variants/${variantId}/image`)
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrf)
        .attach('image', Buffer.from('no soy una imagen'), {
          filename: 'x.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(400);
    });

    it('el endpoint de imagen en base64 (bot) valida el prefijo, el tamaño y exige API key', async () => {
      const apiKey = process.env.CONDUIT_TOOL_API_KEY as string;
      const post = (imageBase64: string, key = apiKey) =>
        request(server)
          .post(`${API}/reservations/${reservationId}/deposits/automatic`)
          .set('X-API-Key', key)
          .send({ phone, coverage: 'ANTICIPO', imageBase64 });
      expect(
        (await post('data:text/html;base64,PGgxPg==', 'mala')).status,
      ).toBe(401);
      expect((await post('data:text/html;base64,PGgxPg==')).status).toBe(400);
      expect((await post('no-es-data-uri')).status).toBe(400);
    });
  });
});
