import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  INestApplication,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, ModuleRef } from '@nestjs/core';
import { Prisma, ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter';
import { ERROR_CATALOG } from 'src/common/errors/error-catalog';
import { CreateReservationDto } from 'src/reservations/dto/create-reservation.dto';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { CompleteReservationOrchestrator } from 'src/reservations/orchestrators/complete-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from 'src/reservations/orchestrators/reschedule-reservation.orchestrator';
import { ApproveDepositOrchestrator } from 'src/deposits/orchestrator/approve-deposit.orchestrator';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  createHarnessModuleWith,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

@Controller('probe')
class ProbeController {
  constructor(private readonly moduleRef: ModuleRef) {}

  private get create() {
    return this.moduleRef.get(CreateReservationOrchestrator, { strict: false });
  }

  private get complete() {
    return this.moduleRef.get(CompleteReservationOrchestrator, {
      strict: false,
    });
  }

  private get reschedule() {
    return this.moduleRef.get(RescheduleReservationOrchestrator, {
      strict: false,
    });
  }

  private get approve() {
    return this.moduleRef.get(ApproveDepositOrchestrator, { strict: false });
  }

  @Post('reserve')
  reserve(@Body() dto: CreateReservationDto) {
    return this.create.execute(dto);
  }

  @Post('complete/:id')
  completeIt(@Param('id') id: string) {
    return this.complete.execute({
      reservationId: id,
      adminUserId: 'probe-admin',
      cashAmount: 0,
      transferAmount: 0,
    });
  }

  @Post('reschedule/:id')
  rescheduleIt(
    @Param('id') id: string,
    @Body() body: { phone: string; start: string },
  ) {
    return this.reschedule.execute(id, body.phone, new Date(body.start));
  }

  @Post('approve/:id')
  approveIt(@Param('id') id: string) {
    return this.approve.execute({
      reservationId: id,
      adminUserId: 'no-existe',
      coverage: 'ANTICIPO',
      amount: 25,
    });
  }

  @Post('boom')
  boom() {
    throw new Error(
      'password=hunter2 postgresql://user:pass@db:5432/x at /Users/dev/src/secret.ts:10',
    );
  }

  @Post('db-fk')
  dbFk() {
    throw new Prisma.PrismaClientKnownRequestError(
      'Invalid `prisma.reservation.create()` invocation: Foreign key constraint failed on the field: `reservations_client_id_fkey (index)` SELECT * FROM reservations',
      { code: 'P2003', clientVersion: 'x' },
    );
  }

  @Post('db-validation')
  dbValidation() {
    throw new Prisma.PrismaClientValidationError(
      'Unknown argument `secretColumn` in SELECT',
      {
        clientVersion: 'x',
      },
    );
  }

  @Post('db-init')
  dbInit() {
    throw new Prisma.PrismaClientInitializationError(
      "Can't reach database server at `db.internal:5432` postgresql://u:p@db.internal/x",
      'x',
    );
  }

  @Post('http500')
  http500() {
    throw new HttpException('detalle interno: stack trace /var/app/x.js', 500);
  }

  @Post('http503')
  http503() {
    throw new HttpException({ message: 'redis://cache:6379 caído' }, 503);
  }

  @Post('bad')
  bad() {
    throw new BadRequestException('Dato inválido');
  }
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
  details?: { errors?: unknown[] };
}

const bodyOf = (res: request.Response) => res.body as ErrorBody;

describe('6. Errores coherentes que no exponen detalles internos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let world: World;

  beforeAll(async () => {
    const moduleRef = await createHarnessModuleWith({
      controllers: [ProbeController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    });
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
  });

  afterAll(async () => {
    await app.close();
  });

  const LEAK =
    /(prisma|postgres|SELECT|INSERT|stack|\/Users\/|\/var\/|node_modules|hunter2|redis:\/\/|db\.internal|secretColumn|reservations_client|\.ts:\d+|at\s+\S+\s+\()/i;

  const expectEnvelope = (body: ErrorBody, status: number, path: string) => {
    expect(Object.keys(body).sort()).toEqual(
      expect.arrayContaining([
        'code',
        'correlationId',
        'message',
        'path',
        'statusCode',
        'timestamp',
      ]),
    );
    for (const key of Object.keys(body)) {
      expect([
        'code',
        'correlationId',
        'details',
        'message',
        'path',
        'statusCode',
        'timestamp',
      ]).toContain(key);
    }
    expect(body.statusCode).toBe(status);
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(typeof body.correlationId).toBe('string');
    expect(body.path).toBe(path);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  };

  describe('errores inesperados no filtran información', () => {
    it.each([
      ['/probe/boom', 500],
      ['/probe/db-fk', 500],
      ['/probe/db-validation', 500],
      ['/probe/db-init', 500],
      ['/probe/http500', 500],
      ['/probe/http503', 503],
    ])('POST %s → %i con mensaje genérico', async (path, status) => {
      const res = await request(app.getHttpServer()).post(path).send({});
      expect(res.status).toBe(status);
      expectEnvelope(bodyOf(res), status, path);
      expect(JSON.stringify(bodyOf(res))).not.toMatch(LEAK);
      expect(bodyOf(res).details).toBeUndefined();
      expect(bodyOf(res).code).toBe(
        status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
      );
    });
  });

  describe('errores de negocio y de validación mantienen el mismo formato', () => {
    it('validación de DTO → 400 VALIDATION_FAILED con lista de errores y sin eco de datos sensibles', async () => {
      const res = await request(app.getHttpServer())
        .post('/probe/reserve')
        .send({
          client: { phone: '1' },
          treatments: ['no-uuid'],
          scheduledStart: 'ayer',
          extra: 'x',
        });
      expect(res.status).toBe(400);
      expectEnvelope(bodyOf(res), 400, '/probe/reserve');
      expect(bodyOf(res).code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(bodyOf(res).details?.errors)).toBe(true);
    });

    it('excepción HTTP genérica → 400 con código genérico', async () => {
      const res = await request(app.getHttpServer())
        .post('/probe/bad')
        .send({});
      expect(res.status).toBe(400);
      expectEnvelope(bodyOf(res), 400, '/probe/bad');
      expect(bodyOf(res).message).toBe('Dato inválido');
    });

    it('transición inválida → 409 RESERVATION_INVALID_TRANSITION', async () => {
      const { reservations } = await moduleCreate(world, prisma, app);
      await prisma.client.reservation.update({
        where: { id: reservations[0].id },
        data: { status: ReservationStatus.CANCELADA },
      });
      const res = await request(app.getHttpServer())
        .post(`/probe/complete/${reservations[0].id}`)
        .send({});
      expect(res.status).toBe(409);
      expectEnvelope(bodyOf(res), 409, `/probe/complete/${reservations[0].id}`);
      expect(bodyOf(res).code).toBe('RESERVATION_INVALID_TRANSITION');
    });

    it('reserva inexistente → 404 con formato uniforme', async () => {
      const res = await request(app.getHttpServer())
        .post('/probe/complete/00000000-0000-4000-8000-000000000000')
        .send({});
      expect(res.status).toBe(404);
      expectEnvelope(
        res.body,
        404,
        '/probe/complete/00000000-0000-4000-8000-000000000000',
      );
    });

    it('teléfono ajeno al reagendar → 403 sin revelar al dueño real', async () => {
      const { reservations, client } = await moduleCreate(world, prisma, app);
      const res = await request(app.getHttpServer())
        .post(`/probe/reschedule/${reservations[0].id}`)
        .send({
          phone: '+573000000001',
          start: futureSlot(40, 10).toISOString(),
        });
      expect(res.status).toBe(403);
      expectEnvelope(
        bodyOf(res),
        403,
        `/probe/reschedule/${reservations[0].id}`,
      );
      expect(JSON.stringify(bodyOf(res))).not.toContain(client.phone);
    });

    it('violación de FK al aprobar con admin inexistente no llega al cliente como detalle de base de datos', async () => {
      const { reservations } = await moduleCreate(world, prisma, app);
      const res = await request(app.getHttpServer())
        .post(`/probe/approve/${reservations[0].id}`)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(bodyOf(res))).not.toMatch(LEAK);
      expectEnvelope(
        res.body,
        res.status,
        `/probe/approve/${reservations[0].id}`,
      );
    });

    it('sin cupo → 409/422 con código PLACEMENT_* estable', async () => {
      const when = futureSlot(45, 10);
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/probe/reserve')
          .send({
            client: newClientDto('lleno'),
            treatments: [world.lowCap.treatmentId],
            scheduledStart: futureSlot(45, 8 + i).toISOString(),
          });
      }
      const res = await request(app.getHttpServer())
        .post('/probe/reserve')
        .send({
          client: newClientDto('sin-cupo'),
          treatments: [world.lowCap.treatmentId],
          scheduledStart: when.toISOString(),
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(String(bodyOf(res).code)).toMatch(/^PLACEMENT_/);
      expectEnvelope(bodyOf(res), res.status, '/probe/reserve');
    });
  });

  describe('catálogo de errores', () => {
    const entries = Object.entries(ERROR_CATALOG);

    it('todos los códigos tienen estado HTTP válido y mensaje legible en español, sin detalles técnicos', () => {
      expect(entries.length).toBeGreaterThan(40);
      for (const [code, def] of entries) {
        expect(def.status).toBeGreaterThanOrEqual(400);
        expect(def.status).toBeLessThan(600);
        expect(def.message.length).toBeGreaterThan(5);
        expect(def.message).not.toMatch(LEAK);
        expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
      }
    });

    it('los errores de servidor del catálogo no prometen detalles', () => {
      for (const [, def] of entries.filter(
        ([, d]) => Number(d.status) >= 500,
      )) {
        expect(def.message).not.toMatch(/(error|exception)\b.*\bat\b/i);
      }
    });
  });
});

async function moduleCreate(
  world: World,
  prisma: PrismaService,
  app: INestApplication,
) {
  const client = newClientDto('err');
  const orchestrator = app.get(CreateReservationOrchestrator);
  const count = await prisma.client.reservation.count();
  const result = await orchestrator.execute({
    client,
    treatments: [world.tertiary.treatmentId],
    scheduledStart: futureSlot(5 + (count % 60), 8 + (count % 9)).toISOString(),
  });
  return { ...result, client };
}
