import { INestApplication } from '@nestjs/common';
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
  Session,
  toSession,
} from './app-harness';
import { newClientDto } from './harness';

const API = '/api/v1';

interface ProfileBody {
  hairLength: string | null;
  hairColor: string | null;
  hairDensity: string | null;
  status: string;
}

describe('Perfil capilar: largo, color y densidad', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let admin: Session;

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    await seedAdmin(prisma);
    const login = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    admin = toSession(login.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => resetThrottle(app));

  const newClient = (
    label: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const dto = newClientDto(label);
    return prisma.client.client.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
        ...overrides,
      },
    });
  };

  const save = (id: string, body: Record<string, unknown>) =>
    request(server)
      .put(`${API}/clients/${id}/hair-profile`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send(body);

  it('guarda la densidad junto con el largo y el color, y la devuelve', async () => {
    const client = await newClient('densidad');

    const res = await save(client.id, {
      hairLength: 'LARGO',
      hairColor: 'OSCURO',
      hairDensity: 'ALTA',
    });

    expect(res.status).toBe(200);
    const body = res.body as ProfileBody;
    expect(body).toMatchObject({
      hairLength: 'LARGO',
      hairColor: 'OSCURO',
      hairDensity: 'ALTA',
      status: 'VALID',
    });
    const stored = await prisma.client.client.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(stored.hairDensity).toBe('ALTA');
  });

  it('registrar un perfil sin densidad se rechaza y no cambia nada', async () => {
    const client = await newClient('sindensidad');

    const res = await save(client.id, {
      hairLength: 'CORTO',
      hairColor: 'CLARO',
    });

    expect(res.status).toBe(400);
    const stored = await prisma.client.client.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(stored.hairLength).toBeNull();
    expect(stored.hairDensity).toBeNull();
  });

  it('una densidad inexistente se rechaza', async () => {
    const client = await newClient('densidadmala');

    const res = await save(client.id, {
      hairLength: 'CORTO',
      hairColor: 'CLARO',
      hairDensity: 'MUCHA',
    });

    expect(res.status).toBe(400);
  });

  it('un perfil anterior sin densidad sigue vigente y se puede completar después', async () => {
    const client = await newClient('anterior', {
      hairLength: 'MEDIANO',
      hairColor: 'CLARO',
      hairProfileUpdatedAt: new Date(),
    });

    const before = await request(server)
      .get(`${API}/clients/${client.id}`)
      .set('Cookie', admin.cookie);
    const view = (before.body as { hairProfile: ProfileBody }).hairProfile;
    expect(view.status).toBe('VALID');
    expect(view.hairDensity).toBeNull();

    const res = await save(client.id, {
      hairLength: 'MEDIANO',
      hairColor: 'CLARO',
      hairDensity: 'BAJA',
    });
    expect((res.body as ProfileBody).hairDensity).toBe('BAJA');
  });
});
