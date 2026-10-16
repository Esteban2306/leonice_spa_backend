import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createSecurityApp,
  HttpServer,
  resetDatabase,
  resetThrottle,
  seedAdmin,
  toSession,
} from './app-harness';

const API = '/api/v1';
const ALLOWED = 'http://localhost:3000';

describe('S6. CORS, cookies, CSRF, HTTPS y cabeceras de seguridad', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    await seedAdmin(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
  });

  describe('cabeceras de seguridad (helmet)', () => {
    it('toda respuesta incluye las cabeceras de endurecimiento y oculta la tecnología', async () => {
      const res = await request(server).get(`${API}/health`);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toMatch(
        /max-age=\d{7,}/,
      );
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['cross-origin-opener-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['server']).toBeUndefined();
    });

    it('las respuestas de error también llevan las cabeceras de seguridad', async () => {
      const res = await request(server).get(`${API}/ruta-que-no-existe`);
      expect(res.status).toBe(404);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('las respuestas con sesión o cookies no se pueden cachear (Cache-Control: no-store)', async () => {
      const login = await request(server)
        .post(`${API}/auth/login`)
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(login.headers['cache-control']).toMatch(/no-store/);
      const s = toSession(login.headers['set-cookie']);
      const me = await request(server)
        .get(`${API}/auth/me`)
        .set('Cookie', s.cookie);
      expect(me.headers['cache-control']).toMatch(/no-store/);
      const clients = await request(server)
        .get(`${API}/clients`)
        .set('Cookie', s.cookie);
      expect(clients.headers['cache-control']).toMatch(/no-store|private/);
    });

    it('el endpoint de salud solo expone estados booleanos, sin versiones ni cadenas de conexión', async () => {
      const res = await request(server).get(`${API}/health`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'database',
        'redis',
        'status',
        'timestamp',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(
        /postgres|redis:\/\/|localhost|version/i,
      );
    });

    it('las métricas de Prometheus no están abiertas a cualquier visitante', async () => {
      for (const path of ['/metrics', `${API}/metrics`, '/api/metrics']) {
        const res = await request(server).get(path);
        expect([401, 403, 404]).toContain(res.status);
      }
    });

    it('Swagger solo se publica fuera de producción', () => {
      const main = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
      expect(main).toMatch(/nodeEnv\s*!==\s*'production'/);
      expect(main.indexOf('SwaggerModule.setup')).toBeGreaterThan(
        main.indexOf("nodeEnv !== 'production'"),
      );
    });
  });

  describe('CORS', () => {
    const preflight = (origin: string, method = 'POST') =>
      request(server)
        .options(`${API}/auth/login`)
        .set('Origin', origin)
        .set('Access-Control-Request-Method', method);

    it('el origen configurado recibe credenciales y puede leer la cabecera de idempotencia', async () => {
      const res = await request(server)
        .get(`${API}/health`)
        .set('Origin', ALLOWED);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-expose-headers']).toMatch(
        /Idempotent-Replayed/i,
      );
      expect(res.headers['vary']).toMatch(/Origin/i);
    });

    it('orígenes no autorizados (incluido "null" y subdominios parecidos) no reciben permisos CORS', async () => {
      for (const origin of [
        'https://evil.example',
        'null',
        'http://localhost:3000.evil.com',
        'http://localhost:3001',
        'https://leonicespa.com.evil.com',
      ]) {
        const res = await request(server)
          .get(`${API}/health`)
          .set('Origin', origin);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it('el preflight de un origen no autorizado no concede métodos ni cabeceras', async () => {
      const res = await preflight('https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('el preflight autorizado solo permite los métodos del diseño (sin TRACE ni OPTIONS arbitrarios)', async () => {
      const res = await preflight(ALLOWED);
      const methods = String(res.headers['access-control-allow-methods'])
        .split(',')
        .map((m) => m.trim());
      expect(methods.sort()).toEqual([
        'DELETE',
        'GET',
        'HEAD',
        'PATCH',
        'POST',
        'PUT',
      ]);
    });

    it('CORS_ORIGIN con varios orígenes separados por coma (con espacios) autoriza a todos', async () => {
      const previous = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = `${ALLOWED}, https://admin.leonice.test`;
      const secondary = await createSecurityApp();
      try {
        const res = await request(secondary.app.getHttpServer())
          .get(`${API}/health`)
          .set('Origin', 'https://admin.leonice.test');
        expect(res.headers['access-control-allow-origin']).toBe(
          'https://admin.leonice.test',
        );
      } finally {
        process.env.CORS_ORIGIN = previous;
        await secondary.app.close();
      }
    });
  });

  describe('cookies, CSRF y HTTPS', () => {
    it('CSRF protege las mutaciones con sesión y no se puede evadir cambiando el método HTTP', async () => {
      const login = await request(server)
        .post(`${API}/auth/login`)
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      const s = toSession(login.headers['set-cookie']);
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        resetThrottle(app);
        const res = await request(server)
          [method](`${API}/business-settings`)
          .set('Cookie', s.cookie)
          .send({});
        expect([403, 404]).toContain(res.status);
      }
    });

    it('una petición cross-site (Origin ajeno) con cookies válidas no cambia datos aunque el navegador envíe las cookies', async () => {
      const login = await request(server)
        .post(`${API}/auth/login`)
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      const s = toSession(login.headers['set-cookie']);
      const res = await request(server)
        .patch(`${API}/auth/password`)
        .set('Origin', 'https://evil.example')
        .set('Cookie', s.cookie)
        .send({
          currentPassword: ADMIN_PASSWORD,
          newPassword: 'Otra#Clave-789',
        });
      expect(res.status).toBe(403);
    });

    it('la aplicación confía en el proxy inverso para obtener la IP real (trust proxy) o fija un límite por origen fiable', () => {
      const setup = readFileSync(
        join(process.cwd(), 'src/app.setup.ts'),
        'utf8',
      );
      const main = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
      expect(`${setup}\n${main}`).toMatch(/trust proxy/);
    });

    it('el servidor aplica HSTS con includeSubDomains para forzar HTTPS en el navegador', async () => {
      const res = await request(server).get(`${API}/health`);
      expect(res.headers['strict-transport-security']).toMatch(
        /includeSubDomains/i,
      );
    });
  });
});
