import { Global, Module, Provider, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { QUEUE_NAMES } from 'src/infrastructure/queue/queue.constants';
import { PrismaModule } from 'src/infrastructure/database/prisma.module';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { EventModule } from 'src/common/events/event.module';
import { ContextModule } from 'src/common/context/context.module';
import { EncryptionModule } from 'src/infrastructure/encryption/encryption.module';
import { ClientsModule } from 'src/clients/clients.module';
import { ReservationsModule } from 'src/reservations/reservations.module';
import { DepositsModule } from 'src/deposits/deposits.module';

export interface RecordedJob {
  queue: string;
  name: string;
  data: unknown;
  opts?: Record<string, unknown>;
}

export class FakeQueue {
  readonly jobs: RecordedJob[] = [];
  failNext = false;

  constructor(private readonly queueName: string) {}

  add(name: string, data: unknown, opts?: Record<string, unknown>) {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('redis caído'));
    }
    this.jobs.push({ queue: this.queueName, name, data, opts });
    return Promise.resolve({ id: String(this.jobs.length) });
  }

  upsertJobScheduler() {
    return Promise.resolve();
  }
}

export const fakeQueues = {
  timeouts: new FakeQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS),
  communications: new FakeQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS),
  outbox: new FakeQueue(QUEUE_NAMES.CONDUIT_OUTBOX),
};

export class MemoryCache {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.store.get(key) as T | undefined) ?? null);
  }

  set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  setIfAbsent(key: string, value: unknown): Promise<boolean> {
    if (this.store.has(key)) return Promise.resolve(false);
    this.store.set(key, value);
    return Promise.resolve(true);
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

@Global()
@Module({
  providers: [
    { provide: SafeCacheService, useValue: new MemoryCache() },
    {
      provide: CloudinaryService,
      useValue: {
        uploadDepositProof: (_buffer: Buffer, reservationId: string) =>
          Promise.resolve({
            url: `https://fake.test/${reservationId}.webp`,
            publicId: `fake-${reservationId}`,
          }),
      },
    },
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
    SafeCacheService,
    CloudinaryService,
    getQueueToken(QUEUE_NAMES.RESERVATION_TIMEOUTS),
    getQueueToken(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS),
    getQueueToken(QUEUE_NAMES.CONDUIT_OUTBOX),
  ],
})
class FakeQueuesModule {}

export async function createHarnessModule(): Promise<TestingModule> {
  const moduleRef = await createHarnessModuleWith({});
  await moduleRef.init();
  return moduleRef;
}

export async function createHarnessModuleWith(extra: {
  controllers?: Type<unknown>[];
  providers?: Provider[];
}): Promise<TestingModule> {
  if (!process.env.DATABASE_URL?.includes('/leonice_audit')) {
    throw new Error(
      'Las pruebas de integración solo corren sobre leonice_audit',
    );
  }
  const moduleRef = await Test.createTestingModule({
    controllers: extra.controllers ?? [],
    providers: extra.providers ?? [],
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      EventModule,
      PrismaModule,
      ContextModule,
      EncryptionModule,
      FakeQueuesModule,
      ClientsModule,
      ReservationsModule,
      DepositsModule,
    ],
  }).compile();
  return moduleRef;
}

const TRUNCATE_ALL = `TRUNCATE TABLE "deposit_records", "reservations", "consent_records", "clients", "treatments", "capacity_pools", "categories", "operating_windows", "schedule_exceptions", "automation_executions", "users" RESTART IDENTITY CASCADE`;

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const ownerUrl = process.env.AUDIT_OWNER_DATABASE_URL;
  if (ownerUrl) {
    const owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    try {
      await owner.$executeRawUnsafe(TRUNCATE_ALL);
    } finally {
      await owner.$disconnect();
    }
  } else {
    await prisma.$executeRawUnsafe(TRUNCATE_ALL);
  }
  for (const queue of Object.values(fakeQueues)) queue.jobs.length = 0;
}

export interface World {
  admin: { id: string };
  principal: {
    categoryId: string;
    treatmentId: string;
    simpleTreatmentId: string;
  };
  secondary: { categoryId: string; treatmentId: string };
  tertiary: { categoryId: string; treatmentId: string };
  lowCap: { categoryId: string; treatmentId: string };
}

export async function seedWorld(prisma: PrismaClient): Promise<World> {
  for (let day = 0; day < 7; day++) {
    await prisma.operatingWindow.create({
      data: { dayOfWeek: day, startMinute: 8 * 60, endMinute: 18 * 60 },
    });
  }
  const admin = await prisma.user.create({
    data: {
      email: `audit-${randomUUID()}@leonice.test`,
      passwordHash: 'x',
    },
  });

  const mkCategory = async (
    slug: string,
    isPrincipal: boolean,
    maxConcurrent: number,
  ) => {
    const category = await prisma.category.create({
      data: { name: slug, slug, isPrincipal },
    });
    await prisma.capacityPool.create({
      data: { categoryId: category.id, name: `${slug}-pool`, maxConcurrent },
    });
    return category.id;
  };
  const mkTreatment = async (
    categoryId: string,
    slug: string,
    duration: number,
    price: number,
    requiresPriorAssessment = false,
  ) =>
    (
      await prisma.treatment.create({
        data: {
          categoryId,
          name: slug,
          slug,
          requiresPriorAssessment,
          basePriceMin: price,
          basePriceMax: price,
          baseDurationMinMinutes: duration,
          baseDurationMaxMinutes: duration,
        },
      })
    ).id;

  const principalCat = await mkCategory('principal', true, 2);
  const secondaryCat = await mkCategory('secundaria', false, 2);
  const tertiaryCat = await mkCategory('terciaria', false, 2);
  const lowCapCat = await mkCategory('baja-capacidad', false, 1);

  return {
    admin,
    principal: {
      categoryId: principalCat,
      treatmentId: await mkTreatment(
        principalCat,
        'tratamiento-principal',
        60,
        100000,
      ),
      simpleTreatmentId: await mkTreatment(
        principalCat,
        'principal-sin-valoracion',
        60,
        120000,
      ),
    },
    secondary: {
      categoryId: secondaryCat,
      treatmentId: await mkTreatment(
        secondaryCat,
        'tratamiento-secundario',
        60,
        50000,
      ),
    },
    tertiary: {
      categoryId: tertiaryCat,
      treatmentId: await mkTreatment(
        tertiaryCat,
        'tratamiento-terciario',
        30,
        30000,
      ),
    },
    lowCap: {
      categoryId: lowCapCat,
      treatmentId: await mkTreatment(
        lowCapCat,
        'tratamiento-cupo-1',
        60,
        80000,
      ),
    },
  };
}

let phoneCounter = 0;
export const newClientDto = (label = 'cliente') => {
  phoneCounter += 1;
  const stamp = String(Date.now()).slice(-6);
  return {
    phone: `+99900${stamp}${String(phoneCounter).padStart(3, '0')}`,
    name: `Audit ${label} ${phoneCounter}`,
    birthDate: '1990-01-01',
  };
};

export function futureSlot(
  daysFromNow: number,
  hour: number,
  minute = 0,
): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export type Tx = Prisma.TransactionClient;
export { PrismaService };

export async function expectAppCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).not.toBeNull();
  const body = (error as { getResponse?: () => unknown }).getResponse?.() as
    { code?: string } | undefined;
  expect(body?.code).toBe(code);
}

export async function settle<T>(promises: Promise<T>[]) {
  const results = await Promise.allSettled(promises);
  const ok = results.filter(
    (r): r is PromiseFulfilledResult<Awaited<T>> => r.status === 'fulfilled',
  );
  const failed = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  const failedCodes = failed.map((f) => {
    const reason = f.reason as {
      getResponse?: () => { code?: string };
      message?: string;
    };
    return reason.getResponse?.().code ?? reason.message ?? 'UNKNOWN';
  });
  return { ok, failed, failedCodes };
}

export async function maxConcurrency(
  prisma: PrismaClient,
  categoryId: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
    SELECT COALESCE(MAX(c), 0) AS max FROM (
      SELECT (
        SELECT COUNT(*) FROM reservations r2
        WHERE r2.category_id = ${categoryId}
          AND r2.status::text NOT IN ('CANCELADA','NO_SHOW','REPROGRAMADA')
          AND r2.scheduled_start <= r1.scheduled_start
          AND r2.scheduled_end > r1.scheduled_start
      ) AS c
      FROM reservations r1
      WHERE r1.category_id = ${categoryId}
        AND r1.status::text NOT IN ('CANCELADA','NO_SHOW','REPROGRAMADA')
    ) t`;
  return Number(rows[0]?.max ?? 0);
}

export function interceptNthCall(
  target: object,
  method: string,
  nth: number,
  replacement: () => unknown,
) {
  const original = Reflect.get(target, method) as (
    ...args: unknown[]
  ) => unknown;
  let calls = 0;
  return jest
    .spyOn(target as Record<string, (...args: unknown[]) => unknown>, method)
    .mockImplementation((...args: unknown[]) => {
      calls += 1;
      return calls === nth ? replacement() : original.apply(target, args);
    });
}
