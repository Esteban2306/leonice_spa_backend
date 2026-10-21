import { INestApplication } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  createSecurityApp,
  HttpServer,
  resetDatabase,
  resetThrottle,
} from './app-harness';
import { futureSlot, newClientDto, seedWorld, World } from './harness';

const API = '/api/v1';

describe('Herramientas del bot de Conduit (llamadas como las hace Conduit)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let world: World;
  const apiKey = process.env.CONDUIT_TOOL_API_KEY as string;

  beforeAll(async () => {
    expect(apiKey).toBeDefined();
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
  });

  const asConduit = (
    method: 'get' | 'post' | 'patch',
    path: string,
    phone: string,
    idempotencyKey = `prueba-${Math.random().toString(36).slice(2)}`,
  ) =>
    request(server)
      [method](`${API}${path}`)
      .set('X-API-Key', apiKey)
      .set('X-Conduit-Conversation-Id', 'conversacion-prueba')
      .set('X-Conduit-Contact-Phone', phone)
      .set('X-Conduit-Idempotency-Key', idempotencyKey);

  const consentTypes = async (phone: string) => {
    const client = await prisma.client.client.findUniqueOrThrow({
      where: { phone },
    });
    const rows = await prisma.client.consentRecord.findMany({
      where: { clientId: client.id },
    });
    return rows.map((r) => r.type).sort();
  };

  it('listar_tratamientos entrega solo lo necesario para ofrecer y reservar, sin contenido de marketing', async () => {
    const res = await asConduit(
      'get',
      '/conduit/booking/treatments',
      '+573001110000',
    );
    expect(res.status).toBe(200);
    const items = res.body as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('basePriceMin');
      expect(item).toHaveProperty('baseDurationMinMinutes');
      expect(item).toHaveProperty('requiresPriorAssessment');
      for (const heavy of [
        'aftercare',
        'benefits',
        'idealFor',
        'results',
        'videoUrl',
        'posterUrl',
        'considerations',
        'createdAt',
      ]) {
        expect(item).not.toHaveProperty(heavy);
      }
    }
  });

  it('registrar un cliente guarda solo los consentimientos aceptados', async () => {
    const { phone, name, birthDate } = newClientDto('consentimientos');
    const res = await asConduit('post', '/conduit/clients', phone).send({
      phone,
      name,
      birthDate,
      allergies: 'Ninguna',
      consents: [
        { type: 'DATOS_SALUD', accepted: true, policyVersion: 'v1' },
        { type: 'MARKETING', accepted: false, policyVersion: 'v1' },
      ],
    });
    expect(res.status).toBe(201);
    expect(await consentTypes(phone)).toEqual([ConsentType.DATOS_SALUD]);
  });

  it('rechazar publicidad no impide actualizar el perfil (PATCH) ni se registra como aceptado', async () => {
    const { phone, name, birthDate } = newClientDto('perfil');
    await asConduit('post', '/conduit/clients', phone).send({
      phone,
      name,
      birthDate,
      consents: [{ type: 'DATOS_SALUD', accepted: true, policyVersion: 'v1' }],
    });

    const res = await asConduit('patch', '/conduit/clients', phone).send({
      phone,
      allergies: 'Alergia al látex',
      consents: [{ type: 'MARKETING', accepted: false, policyVersion: 'v1' }],
    });
    expect(res.status).toBe(200);
    expect((res.body as { allergies: string }).allergies).toBe(
      'Alergia al látex',
    );
    expect(await consentTypes(phone)).toEqual([ConsentType.DATOS_SALUD]);
  });

  it('rechazar publicidad tampoco bloquea la herramienta de registro sobre un cliente existente', async () => {
    const { phone, name, birthDate } = newClientDto('existente');
    await asConduit('post', '/conduit/clients', phone).send({
      phone,
      name,
      birthDate,
    });
    const res = await asConduit('post', '/conduit/clients', phone).send({
      phone,
      consents: [{ type: 'MARKETING', accepted: false, policyVersion: 'v1' }],
    });
    expect(res.status).toBeLessThan(300);
    expect(await consentTypes(phone)).toEqual([]);
  });

  it('aceptar un consentimiento dos veces lo registra una sola vez', async () => {
    const { phone, name, birthDate } = newClientDto('doble');
    await asConduit('post', '/conduit/clients', phone).send({
      phone,
      name,
      birthDate,
    });
    const accept = {
      phone,
      consents: [{ type: 'MARKETING', accepted: true, policyVersion: 'v1' }],
    };
    expect(
      (await asConduit('patch', '/conduit/clients', phone).send(accept)).status,
    ).toBe(200);
    expect(
      (await asConduit('patch', '/conduit/clients', phone).send(accept)).status,
    ).toBe(200);
    expect(await consentTypes(phone)).toEqual([ConsentType.MARKETING]);
  });

  it('el reintento de Conduit con la misma clave devuelve la misma reserva sin crear otra', async () => {
    const { phone, name, birthDate } = newClientDto('reintento');
    const body = {
      client: {
        phone,
        name,
        birthDate,
        consent: { policyVersion: 'v1', healthDataConsent: true },
      },
      treatments: [world.secondary.treatmentId],
      scheduledStart: futureSlot(12, 10).toISOString(),
    };
    const key = 'reintento-misma-clave-0001';
    const first = await asConduit(
      'post',
      '/conduit/booking/reservations',
      phone,
      key,
    ).send(body);
    const retry = await asConduit(
      'post',
      '/conduit/booking/reservations',
      phone,
      key,
    ).send(body);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    const firstBody = first.body as { reservations: { id: string }[] };
    const retryBody = retry.body as { reservations: { id: string }[] };
    expect(retryBody.reservations[0].id).toBe(firstBody.reservations[0].id);
    const client = await prisma.client.client.findUniqueOrThrow({
      where: { phone },
    });
    expect(
      await prisma.client.reservation.count({ where: { clientId: client.id } }),
    ).toBe(1);
  });
});
