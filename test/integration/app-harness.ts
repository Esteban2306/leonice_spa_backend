import './mock-infra';
import { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHmac } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';
import { QueueModule } from 'src/infrastructure/queue/bullmq.module';
import { QUEUE_NAMES } from 'src/infrastructure/queue/queue.constants';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { ARGON2_OPTIONS } from 'src/auth/constants/auth.constants';
import { fakeQueues, resetDatabase } from './harness';

@Global()
@Module({
  providers: [
    {
      provide: getQueueToken(QUEUE_NAMES.RESERVATION_TIMEOUTS),
      useValue: fakeQueues.timeouts,
    },
    {
      provide: getQueueToken(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS),
      useValue: fakeQueues.communications,
    },
    {
      provide: getQueueToken(QUEUE_NAMES.CONDUIT_OUTBOX),
      useValue: fakeQueues.outbox,
    },
  ],
  exports: [
    getQueueToken(QUEUE_NAMES.RESERVATION_TIMEOUTS),
    getQueueToken(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS),
    getQueueToken(QUEUE_NAMES.CONDUIT_OUTBOX),
  ],
})
class FakeQueueModule {}

export const ADMIN_EMAIL = 'seguridad-admin@leonice.test';
export const ADMIN_PASSWORD = 'Contrase#a-Segura-123';

export interface SecurityApp {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createSecurityApp(
  options: { nodeEnv?: string; env?: Record<string, string> } = {},
): Promise<SecurityApp> {
  if (!process.env.DATABASE_URL?.includes('/leonice_audit')) {
    throw new Error('Las pruebas de seguridad solo corren sobre leonice_audit');
  }
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries({
    NODE_ENV: options.nodeEnv,
    ...options.env,
  })) {
    if (value === undefined) continue;
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(QueueModule)
    .useModule(FakeQueueModule)
    .overrideProvider(CloudinaryService)
    .useValue({
      uploadDepositProof: (_b: Buffer, id: string) =>
        Promise.resolve({ url: `https://fake.test/${id}.webp`, publicId: id }),
      uploadDepositProofFromBase64: (_d: string, id: string) =>
        Promise.resolve({ url: `https://fake.test/${id}.webp`, publicId: id }),
      destroyImage: () => Promise.resolve(),
      testimonialImagePublicId: (id: string, slot: string) =>
        `testimonials/${id}-${slot}-${Math.random().toString(36).slice(2)}`,
      uploadTestimonialImage: (_b: Buffer, publicId: string) =>
        Promise.resolve({
          url: `https://fake.test/${publicId}.webp`,
          publicId,
        }),
    })
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: false });
  configureApp(app);
  await app.init();

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return { app, prisma: app.get(PrismaService) };
}

export async function seedAdmin(prisma: PrismaService, email = ADMIN_EMAIL) {
  return prisma.client.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS),
      role: 'ADMIN',
    },
  });
}

export { resetDatabase };

export interface Session {
  access: string;
  refresh: string;
  csrf: string;
  cookie: string;
}

const parseCookies = (setCookie: string[] | string | undefined) => {
  const list = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const out: Record<string, string> = {};
  for (const raw of list) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
};

export const toSession = (
  setCookie: string[] | string | undefined,
): Session => {
  const c = parseCookies(setCookie);
  return {
    access: c['access_token'] ?? '',
    refresh: c['refresh_token'] ?? '',
    csrf: c['csrf_token'] ?? '',
    cookie: `access_token=${c['access_token']}; csrf_token=${c['csrf_token']}`,
  };
};

interface MemoryThrottlerStore {
  storage?: Map<string, unknown>;
  timeoutIds?: Map<string, ReturnType<typeof setTimeout>[]>;
}

export function resetThrottle(app: INestApplication): void {
  const root: MemoryThrottlerStore & {
    primary?: MemoryThrottlerStore;
    fallback?: MemoryThrottlerStore;
  } = app.get(ThrottlerStorage);
  for (const store of [root, root.primary, root.fallback]) {
    if (!store?.storage || !store.timeoutIds) continue;
    store.storage.clear();
    for (const ids of store.timeoutIds.values()) ids.forEach(clearTimeout);
    store.timeoutIds.clear();
  }
}

export interface ApiBody {
  code?: string;
  message?: string;
  status?: string;
  role?: string;
  email?: string;
  [key: string]: unknown;
}

export const bodyOf = (res: { body: unknown }) => res.body as ApiBody;

export type HttpServer = Parameters<typeof import('supertest')>[0];

export function breakThrottleStorage(): () => void {
  const redisStorage = jest.requireMock<{
    ThrottlerStorageRedisService: {
      prototype: { increment: (...args: unknown[]) => Promise<unknown> };
    };
  }>('@nest-lab/throttler-storage-redis').ThrottlerStorageRedisService;
  const original = redisStorage.prototype.increment;
  redisStorage.prototype.increment = () =>
    Promise.reject(new Error('Redis caído'));
  return () => {
    redisStorage.prototype.increment = original;
  };
}

export function cancellationLinkSecret(): string {
  return (
    process.env.CANCELLATION_LINK_SECRET ||
    createHmac('sha256', process.env.JWT_SECRET as string)
      .update('cancellation-link-v1')
      .digest('hex')
  );
}
