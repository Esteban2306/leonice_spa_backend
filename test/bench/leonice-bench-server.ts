import { Test } from '@nestjs/testing';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CONDUIT_TEMPLATE_CATALOG } from 'src/conduit/templates/conduit-template-catalog';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';
import { seedConduitTemplates } from '../../prisma/seed-conduit-templates';
import { seedConduitTools } from '../../prisma/seed-conduit-tools';
import { seedConduitPrompt } from '../../prisma/seed-conduit-prompt';
import { BusinessSettingsService } from 'src/business-settings/business-settings.service';
import { conduitSeedRequest } from '../../prisma/conduit-seed-request';

const BENCH_DB = 'leonice_bench';

interface ReservationSeed {
  treatment: string;
  daysFromNow: number;
  hour: number;
  status: string;
  deposit?: 'PENDIENTE' | 'CONFIRMADO';
}

interface StateSeed {
  phone: string;
  client?: { name: string; birthDate: string };
  reservations?: ReservationSeed[];
}

function assertIsolated(): void {
  const db = new URL(process.env.DATABASE_URL ?? '').pathname.replace('/', '');
  if (db !== BENCH_DB) {
    throw new Error(
      `El servidor de banco solo corre sobre ${BENCH_DB}; DATABASE_URL apunta a ${db}`,
    );
  }
  const redis = new URL(process.env.REDIS_URL ?? '');
  if (redis.port !== process.env.BENCH_REDIS_PORT) {
    throw new Error(
      'El servidor de banco exige el Redis de pruebas (BENCH_REDIS_PORT)',
    );
  }
  const conduit = new URL(process.env.CONDUIT_BASE_URL ?? '');
  if (!['127.0.0.1', 'localhost'].includes(conduit.hostname)) {
    throw new Error(
      'El servidor de banco solo habla con un Conduit local de pruebas',
    );
  }
}

async function wireConduit(): Promise<void> {
  await seedConduitTemplates(process.env);
  await seedConduitTools(process.env);
  await seedConduitPrompt(process.env);
  const request = conduitSeedRequest(
    process.env.CONDUIT_BASE_URL!,
    process.env.CONDUIT_API_KEY!,
  );
  const listed = await request<{
    data: Array<{ id: string; name: string; channel: string }>;
  }>('GET', 'templates?limit=100&page=1');
  for (const template of CONDUIT_TEMPLATE_CATALOG) {
    const remote = listed.data.find((t) => t.name === template.name);
    if (remote) process.env[template.envKey] = remote.id;
  }
}

function zonedDate(daysFromNow: number, hour: number): Date {
  const now = new Date();
  const bogota = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Bogota' }),
  );
  bogota.setDate(bogota.getDate() + daysFromNow);
  const y = bogota.getFullYear();
  const m = String(bogota.getMonth() + 1).padStart(2, '0');
  const d = String(bogota.getDate()).padStart(2, '0');
  return new Date(
    `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:00:00-05:00`,
  );
}

async function seedState(prisma: PrismaService, seed: StateSeed) {
  const db = prisma.client;
  const phone = normalizePhone(seed.phone);
  if (!seed.client) return { phone, client: null, reservations: [] };
  const client = await db.client.upsert({
    where: { phone },
    update: {},
    create: {
      phone,
      name: seed.client.name,
      birthDate: new Date(seed.client.birthDate),
    },
  });
  await db.consentRecord.create({
    data: {
      clientId: client.id,
      type: 'TERMINOS_SERVICIO',
      policyVersion: '1',
      consentedAt: new Date(),
    },
  });
  const created: Array<{ id: string; status: string; start: Date }> = [];
  for (const r of seed.reservations ?? []) {
    const treatment = await db.treatment.findFirstOrThrow({
      where: { name: r.treatment },
    });
    const start = zonedDate(r.daysFromNow, r.hour);
    const minutes =
      treatment.baseDurationMaxMinutes ??
      treatment.baseDurationMinMinutes ??
      60;
    const reservation = await db.reservation.create({
      data: {
        clientId: client.id,
        categoryId: treatment.categoryId,
        treatmentId: treatment.id,
        status: r.status as never,
        channel: 'WHATSAPP' as never,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + minutes * 60_000),
        finalPrice: treatment.basePriceMin ?? 0,
        finalDurationMinutes: minutes,
        depositExpiresAt:
          r.status === 'PENDIENTE_DEPOSITO'
            ? new Date(Date.now() + 24 * 3600_000)
            : null,
        depositClockStartedAt:
          r.status === 'PENDIENTE_DEPOSITO' ? new Date() : null,
      },
    });
    if (r.deposit) {
      await db.depositRecord.create({
        data: {
          reservationId: reservation.id,
          status: r.deposit,
          method: 'MANUAL',
          amount: 50,
          verifiedAt: r.deposit === 'CONFIRMADO' ? new Date() : null,
        },
      });
    }
    created.push({ id: reservation.id, status: reservation.status, start });
  }
  return { phone, client: { id: client.id }, reservations: created };
}

async function inspect(prisma: PrismaService, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  const client = await prisma.client.client.findUnique({
    where: { phone },
    include: {
      reservations: {
        include: { treatment: { select: { name: true } } },
        orderBy: { scheduledStart: 'asc' },
      },
      consentRecords: { select: { type: true } },
    },
  });
  if (!client) return { phone, client: null };
  return {
    phone,
    client: {
      name: client.name,
      consents: client.consentRecords.map((c) => c.type),
    },
    reservations: client.reservations.map((r) => ({
      id: r.id,
      treatment: r.treatment.name,
      status: r.status,
      start: r.scheduledStart.toISOString(),
      rescheduledFromId: r.rescheduledFromId,
    })),
  };
}

const fakeUpload = (reservationId: string) => ({
  url: `https://bench.invalid/${reservationId}.webp`,
  publicId: `bench-${reservationId}`,
});

async function main(): Promise<void> {
  assertIsolated();
  await wireConduit();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CloudinaryService)
    .useValue({
      uploadDepositProof: (_buffer: Buffer, reservationId: string) =>
        Promise.resolve(fakeUpload(reservationId)),
      uploadDepositProofFromBase64: (_data: string, reservationId: string) =>
        Promise.resolve(fakeUpload(reservationId)),
      destroyImage: () => Promise.resolve(),
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app);
  const prisma = app.get(PrismaService);

  await prisma.client.adminNotificationRecipient.upsert({
    where: { phone: '+573000000999' },
    update: {},
    create: {
      name: 'Equipo (banco)',
      phone: '+573000000999',
      email: 'equipo-bench@leonice.test',
    },
  });

  const benchRoutes = Router();
  benchRoutes.post(
    '/state',
    (req: Request, res: Response, next: NextFunction) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        seedState(prisma, JSON.parse(raw) as StateSeed)
          .then((out) => res.json(out))
          .catch(next);
      });
    },
  );
  benchRoutes.get(
    '/inspect',
    (req: Request, res: Response, next: NextFunction) => {
      const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
      inspect(prisma, phone)
        .then((out) => res.json(out))
        .catch(next);
    },
  );
  app.use('/__bench', benchRoutes);

  await app.listen(Number(process.env.PORT), '127.0.0.1');
  await app.get(BusinessSettingsService).update({
    depositAmount: 50,
    depositInstructions:
      'Transferencia Nequi o Bancolombia (datos de prueba del banco de conversaciones).',
    depositPolicy:
      'El anticipo separa el cupo y se descuenta del valor del servicio.',
    cancellationPolicy:
      'Puedes cancelar o reagendar con 24 horas de anticipación; el anticipo no es reembolsable.',
    address: 'Dirección de prueba del banco de conversaciones',
  });
  process.stdout.write(`BENCH_LEONICE_READY ${process.env.PORT}\n`);

  const shutdown = () => {
    void app.close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `BENCH_LEONICE_FAILED ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
