import { INestApplication } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { ClientRetentionService } from 'src/client-privacy/client-retention.service';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
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

const API = '/api/v1';
const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

interface Body {
  code?: string;
  alreadyAnonymized?: boolean;
  proofsDeleted?: number;
}

describe('Privacidad: derecho de supresión y retención de clientes inactivos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let world: World;
  let admin: Session;
  let destroyed: string[];

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
    destroyed = [];
    app.get(CloudinaryService).destroyImage = (publicId: string) => {
      destroyed.push(publicId);
      return Promise.resolve();
    };
  });

  afterAll(async () => {
    delete process.env.DATA_RETENTION_INACTIVE_MONTHS;
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
    destroyed.length = 0;
    delete process.env.DATA_RETENTION_INACTIVE_MONTHS;
  });

  const anonymize = (id: string) =>
    request(server)
      .post(`${API}/clients/${id}/anonymize`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  const newClient = async (
    label: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const dto = newClientDto(label);
    return prisma.client.client.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
        allergies: 'Alergia al látex',
        isPregnant: true,
        hairColor: 'OSCURO',
        hairLength: 'LARGO',
        hairProfileUpdatedAt: new Date(),
        whatsappJid: `${dto.phone.replace('+', '')}@s.whatsapp.net`,
        ...overrides,
      },
    });
  };

  const reservationFor = (
    clientId: string,
    status: ReservationStatus,
    start: Date,
  ) =>
    prisma.client.reservation.create({
      data: {
        clientId,
        treatmentId: world.secondary.treatmentId,
        categoryId: world.secondary.categoryId,
        status,
        channel: 'WEB',
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 60 * 60_000),
        finalPrice: 50,
        finalDurationMinutes: 60,
      },
    });

  it('exige sesión de administrador', async () => {
    const client = await newClient('sinsesion');
    expect(
      (await request(server).post(`${API}/clients/${client.id}/anonymize`))
        .status,
    ).toBe(401);
  });

  it('un cliente inexistente responde 404 y un id mal formado 400', async () => {
    expect(
      (await anonymize('3f2a8f0e-1b7e-4c58-9a55-2d6f0c1e7a11')).status,
    ).toBe(404);
    expect((await anonymize('no-es-uuid')).status).toBe(400);
  });

  it('borra los datos personales y de salud, conserva el historial y borra los comprobantes de Cloudinary', async () => {
    const client = await newClient('supresion');
    const reservation = await reservationFor(
      client.id,
      ReservationStatus.COMPLETADA,
      futureSlot(-30, 10),
    );
    await prisma.client.depositRecord.create({
      data: {
        reservationId: reservation.id,
        status: DepositStatus.CONFIRMADO,
        method: 'MANUAL',
        amount: 20,
        imageUrl: 'https://fake.test/proof.webp',
        imageCloudinaryId: 'proof-1',
      },
    });
    await prisma.client.consentRecord.create({
      data: {
        clientId: client.id,
        type: 'DATOS_SALUD',
        policyVersion: 'v1',
        consentedAt: new Date(),
        ipAddress: '10.0.0.8',
        guardianName: 'Tutora Prueba',
      },
    });

    const res = await anonymize(client.id);

    expect(res.status).toBe(200);
    expect((res.body as Body).proofsDeleted).toBe(1);
    expect(destroyed).toEqual(['proof-1']);

    const after = await prisma.client.client.findUniqueOrThrow({
      where: { id: client.id },
      include: { consentRecords: true },
    });
    expect(after.name).toBe('Cliente anonimizado');
    expect(after.phone).toBe(`anonimizado-${client.id}`);
    expect(after.allergies).toBeNull();
    expect(after.isPregnant).toBe(false);
    expect(after.hairColor).toBeNull();
    expect(after.hairLength).toBeNull();
    expect(after.whatsappJid).toBeNull();
    expect(after.consentRecords).toHaveLength(1);
    expect(after.consentRecords[0].ipAddress).toBeNull();
    expect(after.consentRecords[0].guardianName).toBeNull();

    expect(
      await prisma.client.reservation.count({ where: { clientId: client.id } }),
    ).toBe(1);
    const deposit = await prisma.client.depositRecord.findFirstOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(deposit.imageUrl).toBeNull();
    expect(deposit.imageCloudinaryId).toBeNull();
    expect(Number(deposit.amount)).toBe(20);
  });

  it('es idempotente: repetirlo no vuelve a tocar nada', async () => {
    const client = await newClient('idempotente');
    expect((await anonymize(client.id)).status).toBe(200);
    const again = await anonymize(client.id);
    expect(again.status).toBe(200);
    expect((again.body as Body).alreadyAnonymized).toBe(true);
  });

  it('el teléfono liberado puede volver a registrarse como persona nueva', async () => {
    const client = await newClient('reuso');
    const phone = client.phone;
    await anonymize(client.id);
    const again = await prisma.client.client.create({
      data: { phone, name: 'Persona nueva', birthDate: new Date('1995-05-05') },
    });
    expect(again.id).not.toBe(client.id);
  });

  it('con una reserva activa no se puede borrar a la persona: antes hay que cancelarla', async () => {
    const client = await newClient('activa');
    await reservationFor(
      client.id,
      ReservationStatus.CONFIRMADA,
      futureSlot(20, 10),
    );
    const res = await anonymize(client.id);
    expect(res.status).toBe(409);
    expect((res.body as Body).code).toBe('CLIENT_HAS_ACTIVE_RESERVATIONS');
    expect(
      (
        await prisma.client.client.findUniqueOrThrow({
          where: { id: client.id },
        })
      ).allergies,
    ).toBe('Alergia al látex');
  });

  it('con un anticipo disponible como crédito no se borra: el dinero de la persona no se pierde', async () => {
    const client = await newClient('credito');
    const cancelled = await reservationFor(
      client.id,
      ReservationStatus.CANCELADA,
      futureSlot(21, 10),
    );
    await prisma.client.depositRecord.create({
      data: {
        reservationId: cancelled.id,
        status: DepositStatus.CONFIRMADO,
        method: 'MANUAL',
        amount: 20,
        imageUrl: 'https://fake.test/p.webp',
        imageCloudinaryId: 'proof-credit',
      },
    });
    const res = await anonymize(client.id);
    expect(res.status).toBe(409);
    expect((res.body as Body).code).toBe('CLIENT_HAS_AVAILABLE_CREDIT');
    expect(destroyed).toEqual([]);
  });

  describe('retención automática', () => {
    const retention = () => app.get(ClientRetentionService);

    it('está apagada por defecto fuera de producción: no toca a nadie', async () => {
      await newClient('vieja', {
        createdAt: new Date(Date.now() - 100 * MONTH_MS),
      });
      expect(await retention().sweep()).toMatchObject({
        enabled: false,
        anonymized: 0,
      });
    });

    it('anonimiza a quienes llevan más del plazo sin actividad y respeta a los activos', async () => {
      process.env.DATA_RETENTION_INACTIVE_MONTHS = '12';
      const old = Date.now() - 30 * MONTH_MS;
      const inactive = await newClient('inactiva', {
        createdAt: new Date(old),
      });
      await reservationFor(
        inactive.id,
        ReservationStatus.COMPLETADA,
        new Date(old),
      );
      await prisma.client.reservation.updateMany({
        where: { clientId: inactive.id },
        data: { updatedAt: new Date(old) },
      });

      const recentVisit = await newClient('reciente', {
        createdAt: new Date(old),
      });
      await reservationFor(
        recentVisit.id,
        ReservationStatus.COMPLETADA,
        futureSlot(-20, 10),
      );
      const upcoming = await newClient('proxima', {
        createdAt: new Date(old),
      });
      await reservationFor(
        upcoming.id,
        ReservationStatus.CONFIRMADA,
        futureSlot(10, 10),
      );
      const newcomer = await newClient('nueva');

      const result = await retention().sweep();

      expect(result.enabled).toBe(true);
      const names = async (id: string) =>
        (await prisma.client.client.findUniqueOrThrow({ where: { id } })).name;
      expect(await names(inactive.id)).toBe('Cliente anonimizado');
      expect(await names(recentVisit.id)).not.toBe('Cliente anonimizado');
      expect(await names(upcoming.id)).not.toBe('Cliente anonimizado');
      expect(await names(newcomer.id)).not.toBe('Cliente anonimizado');

      const second = await retention().sweep();
      expect(second.anonymized).toBe(0);
    });
  });
});
