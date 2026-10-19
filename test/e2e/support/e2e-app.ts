import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';
import { ARGON2_OPTIONS } from 'src/auth/constants/auth.constants';
import { OPERATIONAL_TEMPLATE_ENV_KEYS } from 'src/automation/domain/operational-notifications.constants';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { resetDatabase, seedWorld, World } from '../../integration/harness';
import { ConduitSink } from './conduit-sink';

export const ADMIN_EMAIL = 'e2e-admin@leonice.test';
export const ADMIN_PASSWORD = 'Contrase#a-E2E-123';
export const API = '/api/v1';

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

export type HttpServer = Parameters<typeof request>[0];

export function expectStatus(
  res: { status: number; body: unknown },
  ...allowed: number[]
): void {
  if (!allowed.includes(res.status)) {
    throw new Error(
      `Se esperaba ${allowed.join(' o ')} y llegó ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`,
    );
  }
}

const CACHE_PREFIXES = [
  'catalog:*',
  'idempotency:*',
  '{*}:hits',
  '{*}:blocked',
];

export async function flushAppCache(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL as string);
  try {
    for (const pattern of CACHE_PREFIXES) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

export interface FakeCloudinary {
  uploads: string[];
  destroyed: string[];
  failUploads: number;
  afterUpload: (() => Promise<void>) | null;
}

export interface Session {
  cookie: string;
  csrf: string;
}

export interface E2eContext {
  app: INestApplication;
  prisma: PrismaService;
  server: HttpServer;
  sink: ConduitSink;
  cloudinary: FakeCloudinary;
  world: World;
  admin: Session;
  close: () => Promise<void>;
  reset: () => Promise<void>;
  resetThrottle: () => Promise<void>;
}

const cookieValue = (
  setCookie: string[] | string | undefined,
  name: string,
) => {
  const list = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  for (const raw of list) {
    const [pair] = raw.split(';');
    if (pair.startsWith(`${name}=`)) return pair.slice(name.length + 1);
  }
  return '';
};

export async function loginAdmin(server: HttpServer): Promise<Session> {
  const res = await request(server)
    .post(`${API}/auth/login`)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login de administrador falló: ${res.status}`);
  }
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const access = cookieValue(setCookie, 'access_token');
  const csrf = cookieValue(setCookie, 'csrf_token');
  return { cookie: `access_token=${access}; csrf_token=${csrf}`, csrf };
}

export async function createE2eApp(): Promise<E2eContext> {
  const sink = new ConduitSink();
  await sink.start();

  for (const envKey of Object.values(OPERATIONAL_TEMPLATE_ENV_KEYS)) {
    process.env[envKey] = `e2e-${envKey.toLowerCase()}`;
  }

  const cloudinary: FakeCloudinary = {
    uploads: [],
    destroyed: [],
    failUploads: 0,
    afterUpload: null,
  };
  const cloudinaryDouble = {
    uploadDepositProof: async (_buffer: Buffer, reservationId: string) => {
      if (cloudinary.failUploads > 0) {
        cloudinary.failUploads -= 1;
        throw new Error('Cloudinary caído a propósito');
      }
      cloudinary.uploads.push(reservationId);
      const uploaded = {
        url: `https://fake.test/${reservationId}-${cloudinary.uploads.length}.webp`,
        publicId: `fake-${reservationId}-${cloudinary.uploads.length}`,
      };
      if (cloudinary.afterUpload) await cloudinary.afterUpload();
      return uploaded;
    },
    uploadDepositProofFromBase64: (_data: string, reservationId: string) =>
      cloudinaryDouble.uploadDepositProof(Buffer.alloc(0), reservationId),
    destroyImage: (publicId: string) => {
      cloudinary.destroyed.push(publicId);
      return Promise.resolve();
    },
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CloudinaryService)
    .useValue(cloudinaryDouble)
    .compile();

  const configuredConduit = moduleRef
    .get(ConfigService)
    .get<string>('CONDUIT_BASE_URL');
  if (configuredConduit !== sink.baseUrl) {
    await sink.stop();
    throw new Error(
      `Las pruebas e2e solo pueden hablar con el sumidero local de Conduit (${sink.baseUrl}); la configuración apunta a ${configuredConduit}.`,
    );
  }

  const app = moduleRef.createNestApplication({ bufferLogs: false });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const server = app.getHttpServer() as HttpServer;

  const context: E2eContext = {
    app,
    prisma,
    server,
    sink,
    cloudinary,
    world: undefined as unknown as World,
    admin: undefined as unknown as Session,
    reset: async () => {
      await resetDatabase(prisma.client);
      await flushAppCache();
      context.world = await seedWorld(prisma.client);
      await prisma.client.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash: await argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS),
          role: 'ADMIN',
        },
      });
      context.admin = await loginAdmin(server);
      sink.clear();
      cloudinary.uploads.length = 0;
      cloudinary.destroyed.length = 0;
      cloudinary.failUploads = 0;
      cloudinary.afterUpload = null;
    },
    resetThrottle: () => flushAppCache(),
    close: async () => {
      await app.close();
      await sink.stop();
    },
  };

  await context.reset();
  return context;
}

export function asAdmin(
  ctx: Pick<E2eContext, 'server' | 'admin'>,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
) {
  return request(ctx.server)
    [method](`${API}${path}`)
    .set('Cookie', ctx.admin.cookie)
    .set('X-CSRF-Token', ctx.admin.csrf);
}
