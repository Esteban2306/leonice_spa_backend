import { INestApplication, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { signCancellationLink } from 'src/reservations/domain/cancellation-link-token';
import {
  ADMIN_EMAIL,
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
import { collectRoutes } from './route-inventory';

const API = '/api/v1';

describe('S7. Datos personales y de salud: acceso, cifrado, consentimiento, trazabilidad y retención', () => {
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

  const adminCall = (method: 'get' | 'post' | 'patch', path: string) =>
    request(server)
      [method](`${API}${path}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  const createClientAsAdmin = async (allergies: string) => {
    const dto = newClientDto('salud');
    const res = await adminCall('post', '/clients').send({
      phone: dto.phone,
      name: dto.name,
      birthDate: dto.birthDate,
      allergies,
      healthDataPolicyVersion: 'v1',
    });
    return { dto, res };
  };

  describe('cifrado y consentimiento', () => {
    it('las alergias se guardan cifradas (AES-256-GCM con IV aleatorio) y solo el administrador las lee en claro', async () => {
      const secret = 'Alérgica a la penicilina y al amoníaco';
      const { dto, res } = await createClientAsAdmin(secret);
      expect(res.status).toBeLessThan(300);

      const rows = await prisma.client.$queryRaw<
        { allergies: string | null }[]
      >`
        SELECT allergies FROM clients WHERE phone = ${dto.phone.startsWith('+') ? dto.phone : `+${dto.phone}`}`;
      const stored = rows[0]?.allergies ?? '';
      expect(stored).not.toBe('');
      expect(stored).not.toContain('penicilina');
      expect(Buffer.from(stored, 'base64').length).toBeGreaterThan(12 + 16);

      const second = await createClientAsAdmin(secret);
      const rows2 = await prisma.client.$queryRaw<
        { allergies: string | null }[]
      >`
        SELECT allergies FROM clients WHERE phone = ${second.dto.phone.startsWith('+') ? second.dto.phone : `+${second.dto.phone}`}`;
      expect(rows2[0]?.allergies).not.toBe(stored);

      const clientId = (res.body as { id: string }).id;
      const read = await adminCall('get', `/clients/${clientId}`);
      expect(JSON.stringify(read.body)).toContain('penicilina');
      const anonymous = await request(server).get(`${API}/clients/${clientId}`);
      expect(anonymous.status).toBe(401);
    });

    it('registrar alergias o embarazo por el canal público exige consentimiento explícito y lo deja registrado con versión de política', async () => {
      const dto = newClientDto('consent');
      const withoutConsent = await request(server)
        .post(`${API}/clients/resolve`)
        .set('Cookie', 'csrf_token=a')
        .set('X-CSRF-Token', 'a')
        .send({
          phone: dto.phone,
          name: dto.name,
          birthDate: dto.birthDate,
          allergies: 'polen',
        });
      expect(withoutConsent.status).toBe(400);

      const withConsent = await request(server)
        .post(`${API}/clients/resolve`)
        .set('Cookie', 'csrf_token=a')
        .set('X-CSRF-Token', 'a')
        .send({
          phone: dto.phone,
          name: dto.name,
          birthDate: dto.birthDate,
          allergies: 'polen',
          consent: { healthDataConsent: true, policyVersion: 'v1' },
        });
      expect(withConsent.status).toBeLessThan(300);
      const records = await prisma.client.consentRecord.findMany({
        where: { clientId: (withConsent.body as { id: string }).id },
      });
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('DATOS_SALUD');
      expect(records[0].policyVersion).toBe('v1');
    });

    it('un consentimiento falso (healthDataConsent=false) se rechaza', async () => {
      const dto = newClientDto('consent-no');
      const res = await request(server)
        .post(`${API}/clients/resolve`)
        .set('Cookie', 'csrf_token=a')
        .set('X-CSRF-Token', 'a')
        .send({
          phone: dto.phone,
          name: dto.name,
          birthDate: dto.birthDate,
          isPregnant: true,
          consent: { healthDataConsent: false, policyVersion: 'v1' },
        });
      expect(res.status).toBe(400);
    });
  });

  describe('trazabilidad (quién accedió o cambió datos personales)', () => {
    it('modificar una ficha de cliente deja un registro de auditoría con el administrador, la entidad y la IP', async () => {
      const { res } = await createClientAsAdmin('ninguna');
      const clientId = (res.body as { id: string }).id;
      await adminCall('patch', `/clients/${clientId}`).send({
        name: 'Nombre Corregido',
      });
      await new Promise((r) => setTimeout(r, 200));
      const logs = await prisma.client.auditLog.findMany({
        where: { entityId: clientId },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].userId).not.toBeNull();
    });
  });

  describe('registros (logs)', () => {
    it('los logs de acceso no contienen tokens de cancelación ni teléfonos en la URL', async () => {
      const client = newClientDto('logs');
      const created = await app.get(CreateReservationOrchestrator).execute({
        client,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(25, 10).toISOString(),
      });
      const row = await prisma.client.client.findUniqueOrThrow({
        where: { phone: client.phone },
      });
      const secret = createHmac('sha256', process.env.JWT_SECRET as string)
        .update('cancellation-link-v1')
        .digest('hex');
      const token = signCancellationLink(secret, {
        clientId: row.id,
        reservationId: created.reservations[0].id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const lines: string[] = [];
      const capture = (message: unknown) => {
        lines.push(
          typeof message === 'string' ? message : JSON.stringify(message),
        );
      };
      const spies = (['log', 'debug', 'warn', 'error', 'verbose'] as const).map(
        (level) =>
          jest.spyOn(Logger.prototype, level).mockImplementation(capture),
      );
      try {
        await request(server).get(`${API}/cancellation-links/${token}`);
        await request(server)
          .get(`${API}/products/recommended-for-client`)
          .query({ phone: client.phone });
        await request(server).post(`${API}/auth/login`).send({
          email: ADMIN_EMAIL,
          password: 'ContraseñaQueNoDebeLoguearse1!',
        });
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      const joined = lines.join('\n');
      expect(joined).not.toContain(token);
      expect(joined).not.toContain(client.phone);
      expect(joined).not.toContain('ContraseñaQueNoDebeLoguearse1!');
    });
  });

  describe('almacenamiento de comprobantes y retención', () => {
    it('los comprobantes de pago se suben con entrega autenticada (no públicos por URL)', async () => {
      let captured: Record<string, unknown> | undefined;
      const fake = {
        uploader: {
          upload_stream: (
            options: Record<string, unknown>,
            callback: (error: unknown, result: unknown) => void,
          ) => {
            captured = options;
            return {
              end: () =>
                callback(null, {
                  public_id: 'x',
                  secure_url: 'https://res.cloudinary.com/x',
                }),
            };
          },
        },
      };
      const service = new CloudinaryService(fake as never);
      await service.uploadDepositProof(
        Buffer.from('x'),
        '00000000-0000-4000-8000-000000000001',
      );
      expect(
        captured?.type === 'authenticated' ||
          captured?.access_mode === 'authenticated',
      ).toBe(true);
    });

    it('existe una vía para eliminar o anonimizar a una persona a solicitud suya (derecho de supresión)', () => {
      const routes = collectRoutes(app);
      const erasure = routes.filter(
        (r) =>
          r.template.includes('/clients') &&
          (r.method === 'DELETE' || /anonym|erase|supres/i.test(r.template)),
      );
      expect(erasure.length).toBeGreaterThan(0);
    });

    it('existe una política de retención automatizada para datos de clientes inactivos', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const walk = (dir: string): string[] =>
        fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((entry) =>
            entry.isDirectory()
              ? walk(path.join(dir, entry.name))
              : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
                ? [path.join(dir, entry.name)]
                : [],
          );
      const sources = walk(path.join(process.cwd(), 'src'));
      const hit = sources.filter((file) =>
        /retenci[oó]n|retention|purgeInactive|anonymi[sz]e/i.test(
          fs.readFileSync(file, 'utf8'),
        ),
      );
      expect(hit).not.toEqual([]);
    });
  });
});
