import { TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, UnrecoverableError } from 'bullmq';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  CancellationSource,
  DepositCoverage,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from 'src/infrastructure/queue/queue.constants';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { ReservationTimeoutsProcessor } from 'src/automation/processors/reservation-timeouts.processor';
import { AutomationCommunicationsProcessor } from 'src/automation/processors/automation-communications.processor';
import { AutomationExecutionRepository } from 'src/automation/repositories/automation-execution.repository';
import { ConduitOutboxProcessor } from 'src/conduit/processors/conduit-outbox.processor';
import { ConduitOutboxRepository } from 'src/conduit/repositories/conduit-outbox.repository';
import {
  ConduitOutboxService,
  OUTBOX_STALE_AFTER_MS,
  outboxJobId,
} from 'src/conduit/service/conduit-outbox.service';
import { ConduitOutboxListener } from 'src/conduit/listeners/conduit-outbox.listener';
import { ENQUEUE_WAIT_MS } from 'src/infrastructure/queue/enqueue-within';
import { ConduitApiClient } from 'src/conduit/client/conduit-api.client';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { AdminCancelReservationOrchestrator } from 'src/reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from 'src/reservations/orchestrators/mark-no-show.orchestrator';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { CheckInReservationOrchestrator } from 'src/reservations/orchestrators/check-in-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from 'src/reservations/orchestrators/reschedule-reservation.orchestrator';
import { ApproveDepositOrchestrator } from 'src/deposits/orchestrator/approve-deposit.orchestrator';
import { SubmitDepositProofOrchestrator } from 'src/deposits/orchestrator/submit-deposit-proof.orchestrator';
import { ManualDepositVerificationStrategy } from 'src/deposits/strategies/manual-deposit-verification.strategy';
import {
  createHarnessModule,
  FakeQueue,
  fakeQueues,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

const job = (
  name: string,
  data: Record<string, unknown>,
  extra: Partial<Job> = {},
): Job =>
  ({
    id: `job-${Math.random().toString(36).slice(2)}`,
    name,
    data,
    queueName: QUEUE_NAMES.RESERVATION_TIMEOUTS,
    opts: { attempts: 3 },
    attemptsMade: 0,
    timestamp: Date.now(),
    ...extra,
  }) as unknown as Job;

describe('5. Procesos BullMQ: idempotencia, reintentos y duplicados', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let processor: ReservationTimeoutsProcessor;
  let create: CreateReservationOrchestrator;
  let approve: ApproveDepositOrchestrator;
  let events: EventEmitter2;
  let executions: AutomationExecutionRepository;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
    approve = moduleRef.get(ApproveDepositOrchestrator);
    events = moduleRef.get(EventEmitter2);
    executions = new AutomationExecutionRepository(prisma);
    processor = new ReservationTimeoutsProcessor(
      moduleRef.get(ReservationsRepository),
      moduleRef.get(AdminCancelReservationOrchestrator),
      moduleRef.get(MarkNoShowOrchestrator),
      executions,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  let day = 3;
  const book = async (treatmentId = world.secondary.treatmentId) => {
    const client = newClientDto('cola');
    const { reservations } = await create.execute({
      client,
      treatments: [treatmentId],
      scheduledStart: futureSlot(day++, 9).toISOString(),
    });
    return { client, reservation: reservations[0] };
  };

  const expireDeposit = (id: string) =>
    prisma.client.reservation.update({
      where: { id },
      data: { depositExpiresAt: new Date(Date.now() - 60_000) },
    });

  const logsOf = (reservationId: string, type: AutomationExecutionType) =>
    prisma.client.automationExecution.findMany({
      where: { reservationId, type },
    });

  const count = (type: string) => {
    let n = 0;
    const listener = () => {
      n += 1;
    };
    events.on(type, listener);
    return {
      get value() {
        return n;
      },
      stop: () => events.off(type, listener),
    };
  };

  describe('vencimiento de depósito', () => {
    it('cancela una vez por vencimiento; el duplicado secuencial se omite sin efectos dobles', async () => {
      const { reservation } = await book();
      await expireDeposit(reservation.id);
      const emitted = count(EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT);

      const data = { reservationId: reservation.id };
      await processor.process(job(JOB_NAMES.DEPOSITO_TIMEOUT, data));
      await processor.process(job(JOB_NAMES.DEPOSITO_TIMEOUT, data));
      emitted.stop();

      const row = await prisma.client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(row.status).toBe(ReservationStatus.CANCELADA);
      expect(row.cancellationSource).toBe('TIMEOUT');
      expect(emitted.value).toBe(1);
      const logs = await logsOf(
        reservation.id,
        AutomationExecutionType.DEPOSITO_TIMEOUT,
      );
      expect(
        logs.filter((l) => l.result === AutomationExecutionResult.EXECUTED),
      ).toHaveLength(1);
      expect(
        logs.filter((l) => l.result === AutomationExecutionResult.SKIPPED),
      ).toHaveLength(1);
    });

    it('8 copias simultáneas del mismo job: una sola cancelación, un solo evento y una sola ejecución registrada', async () => {
      const { reservation } = await book();
      await expireDeposit(reservation.id);
      const emitted = count(EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT);

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          processor.process(
            job(JOB_NAMES.DEPOSITO_TIMEOUT, { reservationId: reservation.id }),
          ),
        ),
      );
      emitted.stop();

      expect(results).toHaveLength(8);
      expect(emitted.value).toBe(1);
      const logs = await logsOf(
        reservation.id,
        AutomationExecutionType.DEPOSITO_TIMEOUT,
      );
      expect(
        logs.filter((l) => l.result === AutomationExecutionResult.EXECUTED),
      ).toHaveLength(1);
    });

    it('las copias simultáneas perdedoras terminan en SKIPPED, no como fallo irrecuperable', async () => {
      const { reservation } = await book();
      await expireDeposit(reservation.id);

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          processor.process(
            job(JOB_NAMES.DEPOSITO_TIMEOUT, { reservationId: reservation.id }),
          ),
        ),
      );

      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
    });

    it('no cancela si el plazo fue extendido, si hay comprobante pendiente, si ya está confirmada o si fue revivida sin plazo', async () => {
      const extended = (await book()).reservation;
      const proof = await book();
      const confirmed = await book();
      const revived = (await book()).reservation;

      await expireDeposit(proof.reservation.id);
      await moduleRef.get(SubmitDepositProofOrchestrator).execute({
        strategy: moduleRef.get(ManualDepositVerificationStrategy),
        reservationId: proof.reservation.id,
        phone: proof.client.phone,
        fileBuffer: Buffer.from('x'),
      });
      await approve.execute({
        reservationId: confirmed.reservation.id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 10,
      });
      await prisma.client.reservation.update({
        where: { id: revived.id },
        data: { depositExpiresAt: null },
      });

      for (const id of [
        extended.id,
        proof.reservation.id,
        confirmed.reservation.id,
        revived.id,
      ]) {
        await processor.process(
          job(JOB_NAMES.DEPOSITO_TIMEOUT, { reservationId: id }),
        );
      }

      const statuses = await Promise.all(
        [
          extended.id,
          proof.reservation.id,
          confirmed.reservation.id,
          revived.id,
        ].map(
          async (id) =>
            (
              await prisma.client.reservation.findUniqueOrThrow({
                where: { id },
              })
            ).status,
        ),
      );
      expect(statuses).toEqual([
        ReservationStatus.PENDIENTE_DEPOSITO,
        ReservationStatus.PENDIENTE_DEPOSITO,
        ReservationStatus.CONFIRMADA,
        ReservationStatus.PENDIENTE_DEPOSITO,
      ]);
    });

    it('el barrido procesa todos los vencidos y repetirlo no cancela dos veces', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const { reservation } = await book();
        await expireDeposit(reservation.id);
        ids.push(reservation.id);
      }
      const emitted = count(EVENT_TYPES.RESERVATION_CANCELLED_BY_TIMEOUT);

      await processor.process(job(JOB_NAMES.DEPOSIT_EXPIRY_SWEEP, {}));
      await processor.process(job(JOB_NAMES.DEPOSIT_EXPIRY_SWEEP, {}));
      emitted.stop();

      const rows = await prisma.client.reservation.findMany({
        where: { id: { in: ids } },
      });
      expect(rows.every((r) => r.status === ReservationStatus.CANCELADA)).toBe(
        true,
      );
      expect(emitted.value).toBe(4);
    });

    it('un job sin reservationId es un error irrecuperable (no se reintenta)', async () => {
      await expect(
        processor.process(job(JOB_NAMES.DEPOSITO_TIMEOUT, {})),
      ).rejects.toBeInstanceOf(UnrecoverableError);
    });

    it('un job para una reserva inexistente se omite sin lanzar error', async () => {
      await expect(
        processor.process(
          job(JOB_NAMES.DEPOSITO_TIMEOUT, {
            reservationId: '00000000-0000-4000-8000-000000000000',
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it('un fallo transitorio de base se propaga para que BullMQ reintente, y el reintento completa la cancelación', async () => {
      const { reservation } = await book();
      await expireDeposit(reservation.id);
      const repo = moduleRef.get(ReservationsRepository);
      const spy = jest
        .spyOn(repo, 'updateStatusIfCurrent')
        .mockRejectedValueOnce(new Error('conexión perdida'));

      await expect(
        processor.process(
          job(JOB_NAMES.DEPOSITO_TIMEOUT, { reservationId: reservation.id }),
        ),
      ).rejects.toThrow('conexión perdida');
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe(ReservationStatus.PENDIENTE_DEPOSITO);

      await processor.process(
        job(
          JOB_NAMES.DEPOSITO_TIMEOUT,
          { reservationId: reservation.id },
          { attemptsMade: 1 },
        ),
      );
      spy.mockRestore();
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe(ReservationStatus.CANCELADA);
    });
  });

  describe('no-show', () => {
    const confirmedPastGrace = async () => {
      const { reservation } = await book(world.tertiary.treatmentId);
      await approve.execute({
        reservationId: reservation.id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 10,
      });
      await prisma.client.reservation.update({
        where: { id: reservation.id },
        data: {
          scheduledStart: new Date(Date.now() - 3_600_000),
          scheduledEnd: new Date(Date.now() - 1_800_000),
        },
      });
      return reservation;
    };

    it('marca NO_SHOW una sola vez aunque lleguen 8 copias del job, con un solo evento', async () => {
      const reservation = await confirmedPastGrace();
      const emitted = count(EVENT_TYPES.RESERVATION_NO_SHOW);

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          processor.process(
            job(JOB_NAMES.NO_SHOW_CHECK, { reservationId: reservation.id }),
          ),
        ),
      );
      emitted.stop();

      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
      expect(emitted.value).toBe(1);
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe(ReservationStatus.NO_SHOW);
    });

    it('no marca no-show si ya hizo check-in', async () => {
      const reservation = await confirmedPastGrace();
      await moduleRef
        .get(CheckInReservationOrchestrator)
        .execute(reservation.id, new Date());
      await processor.process(
        job(JOB_NAMES.NO_SHOW_CHECK, { reservationId: reservation.id }),
      );
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe(ReservationStatus.CITA_EN_CURSO);
    });

    it('un job viejo de no-show tras reprogramar la cita no la marca no-show', async () => {
      const { client, reservation } = await book(world.lowCap.treatmentId);
      await approve.execute({
        reservationId: reservation.id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 10,
      });
      await moduleRef
        .get(RescheduleReservationOrchestrator)
        .execute(reservation.id, client.phone, futureSlot(day + 20, 11));

      await processor.process(
        job(JOB_NAMES.NO_SHOW_CHECK, { reservationId: reservation.id }),
      );

      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe(ReservationStatus.CONFIRMADA);
    });

    it('el barrido de no-show es idempotente', async () => {
      const a = await confirmedPastGrace();
      const emitted = count(EVENT_TYPES.RESERVATION_NO_SHOW);
      await processor.process(job(JOB_NAMES.NO_SHOW_SWEEP, {}));
      await processor.process(job(JOB_NAMES.NO_SHOW_SWEEP, {}));
      emitted.stop();
      expect(emitted.value).toBeGreaterThanOrEqual(1);
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({
            where: { id: a.id },
          })
        ).status,
      ).toBe(ReservationStatus.NO_SHOW);
    });
  });

  describe('outbox hacia Conduit', () => {
    const pushed: { eventId: string; eventType: string }[] = [];
    let pushImpl: () => Promise<void>;
    let outboxProcessor: ConduitOutboxProcessor;
    let outboxRepo: ConduitOutboxRepository;
    let outboxQueue: FakeQueue;
    let outboxService: ConduitOutboxService;

    beforeAll(() => {
      outboxRepo = new ConduitOutboxRepository(prisma);
      outboxQueue = new FakeQueue(QUEUE_NAMES.CONDUIT_OUTBOX);
      outboxService = new ConduitOutboxService(
        outboxRepo,
        outboxQueue as never,
      );
      const api = {
        pushBusinessEvent: (p: { eventId: string; eventType: string }) => {
          pushed.push({ eventId: p.eventId, eventType: p.eventType });
          return pushImpl();
        },
      } as unknown as ConduitApiClient;
      outboxProcessor = new ConduitOutboxProcessor(
        outboxRepo,
        api,
        outboxService,
      );
    });

    beforeEach(() => {
      pushed.length = 0;
      pushImpl = () => Promise.resolve();
      outboxQueue.jobs.length = 0;
    });

    const createdEvent = async (enqueue: () => Promise<void>) => {
      const spy = jest.spyOn(outboxRepo, 'create');
      await enqueue();
      const event = (await spy.mock.results[0].value) as { id: string };
      spy.mockRestore();
      return event;
    };

    const outboxJob = (id: string, extra: Partial<Job> = {}) =>
      job(
        JOB_NAMES.PUBLISH_CONDUIT_EVENT,
        { outboxEventId: id },
        {
          queueName: QUEUE_NAMES.CONDUIT_OUTBOX,
          opts: { attempts: 5 },
          ...extra,
        },
      );

    it('un evento ya enviado no se vuelve a publicar aunque el job llegue duplicado', async () => {
      const event = await outboxRepo.create('reservation.created', { a: 1 });
      await outboxProcessor.process(outboxJob(event.id));
      await outboxProcessor.process(outboxJob(event.id));
      await outboxProcessor.process(outboxJob(event.id));
      expect(pushed).toHaveLength(1);
      expect((await outboxRepo.findById(event.id))?.status).toBe('SENT');
    });

    it('si Conduit falla, el job reintenta con el mismo eventId y termina en SENT', async () => {
      const event = await outboxRepo.create('reservation.confirmed', { a: 2 });
      pushImpl = () => Promise.reject(new Error('503'));
      await expect(
        outboxProcessor.process(outboxJob(event.id)),
      ).rejects.toThrow('503');
      expect((await outboxRepo.findById(event.id))?.status).toBe('PENDING');

      pushImpl = () => Promise.resolve();
      await outboxProcessor.process(outboxJob(event.id, { attemptsMade: 1 }));
      expect(pushed.map((p) => p.eventId)).toEqual([event.id, event.id]);
      expect((await outboxRepo.findById(event.id))?.status).toBe('SENT');
    });

    it('si el proceso cae entre publicar y marcar SENT, el reintento reenvía con el mismo eventId (la idempotencia la aporta Conduit)', async () => {
      const event = await outboxRepo.create('reservation.cancelled', { a: 3 });
      jest
        .spyOn(outboxRepo, 'markSent')
        .mockRejectedValueOnce(new Error('db caída'));
      await expect(
        outboxProcessor.process(outboxJob(event.id)),
      ).rejects.toThrow('db caída');
      await outboxProcessor.process(outboxJob(event.id, { attemptsMade: 1 }));
      expect(new Set(pushed.map((p) => p.eventId)).size).toBe(1);
      expect((await outboxRepo.findById(event.id))?.status).toBe('SENT');
    });

    it('al agotar los intentos el evento queda FAILED y solo se puede reintentar manualmente si no fue enviado', async () => {
      const event = await outboxRepo.create('reservation.created', { a: 4 });
      await outboxProcessor.onFailed(
        outboxJob(event.id, { attemptsMade: 5 }),
        new Error('agotado'),
      );
      const failed = await outboxRepo.findById(event.id);
      expect(failed?.status).toBe('FAILED');
      expect(failed?.lastError).toBe('agotado');

      const service = new ConduitOutboxService(
        outboxRepo,
        new FakeQueue('x') as never,
      );
      expect(await service.retry(event.id)).toBe(true);
      await outboxProcessor.process(outboxJob(event.id));
      expect(await service.retry(event.id)).toBe(false);
    });

    it('si Redis falla al encolar, el evento queda PENDING sin romper el flujo y el barrido lo publica después', async () => {
      outboxQueue.failNext = true;
      const event = await createdEvent(() =>
        outboxService.enqueue('reservation.created', { a: 5 }),
      );
      expect((await outboxRepo.findById(event.id))?.status).toBe('PENDING');
      expect(outboxQueue.jobs).toHaveLength(0);

      const later = new Date(Date.now() + OUTBOX_STALE_AFTER_MS + 1_000);
      expect(await outboxService.sweepPending(later)).toBeGreaterThanOrEqual(1);
      expect(outboxQueue.jobs.map((j) => j.opts?.jobId)).toContain(
        outboxJobId(event.id),
      );
      await outboxProcessor.process(outboxJob(event.id));
      expect((await outboxRepo.findById(event.id))?.status).toBe('SENT');
    });

    it('cada evento se encola con un jobId estable para que BullMQ descarte copias mientras el job siga vivo', async () => {
      const event = await createdEvent(() =>
        outboxService.enqueue('reservation.created', { a: 6 }),
      );
      expect(outboxQueue.jobs).toEqual([
        expect.objectContaining({
          name: JOB_NAMES.PUBLISH_CONDUIT_EVENT,
          data: { outboxEventId: event.id },
          opts: { jobId: outboxJobId(event.id) },
        }),
      ]);
    });

    it('el barrido solo reencola pendientes viejos: ignora recientes, enviados y fallidos', async () => {
      await prisma.client.conduitOutboxEvent.deleteMany({});
      const old = new Date(Date.now() - OUTBOX_STALE_AFTER_MS - 60_000);
      const base = { eventType: 'reservation.created', payload: {} };
      const stale = await prisma.client.conduitOutboxEvent.create({
        data: { ...base, createdAt: old },
      });
      await prisma.client.conduitOutboxEvent.create({ data: base });
      await prisma.client.conduitOutboxEvent.create({
        data: { ...base, createdAt: old, status: 'SENT' },
      });
      await prisma.client.conduitOutboxEvent.create({
        data: { ...base, createdAt: old, status: 'FAILED' },
      });

      expect(await outboxService.sweepPending()).toBe(1);
      expect(outboxQueue.jobs.map((j) => j.opts?.jobId)).toEqual([
        outboxJobId(stale.id),
      ]);
    });

    it('el job de barrido lo atiende el mismo procesador y su fallo no marca eventos como FAILED', async () => {
      const sweep = jest
        .spyOn(outboxService, 'sweepPending')
        .mockResolvedValueOnce(0);
      const sweepJob = job(
        JOB_NAMES.CONDUIT_OUTBOX_SWEEP,
        {},
        { queueName: QUEUE_NAMES.CONDUIT_OUTBOX, opts: { attempts: 1 } },
      );
      await outboxProcessor.process(sweepJob);
      expect(sweep).toHaveBeenCalledTimes(1);
      expect(pushed).toHaveLength(0);

      const markFailed = jest.spyOn(outboxRepo, 'markFailed');
      await outboxProcessor.onFailed(
        { ...sweepJob, attemptsMade: 1 } as Job,
        new Error('barrido caído'),
      );
      expect(markFailed).not.toHaveBeenCalled();
      markFailed.mockRestore();
      sweep.mockRestore();
    });

    it('Conduit recibe el ciclo de vida completo: reprogramaciones, cancelaciones del negocio, no-show y completadas', async () => {
      const listener = new ConduitOutboxListener(outboxService);
      const enqueue = jest
        .spyOn(outboxService, 'enqueue')
        .mockResolvedValue(undefined);
      const before = new Date('2026-11-01T14:00:00.000Z');
      const after = new Date('2026-11-02T19:00:00.000Z');

      await listener.handleRescheduledByClient({
        payload: {
          originalReservationId: 'r1',
          newReservationId: 'r1',
          clientId: 'c1',
          previousScheduledStart: before,
          newScheduledStart: after,
        },
      } as never);
      await listener.handleRescheduledByAdmin({
        payload: {
          reservationId: 'r2',
          clientId: 'c2',
          previousScheduledStart: before,
          newScheduledStart: after,
          notifyClient: false,
        },
      } as never);
      await listener.handleCancelledByBusiness({
        payload: {
          reservationId: 'r3',
          clientId: 'c3',
          source: CancellationSource.TIMEOUT,
          reason: 'Abono vencido',
        },
      } as never);
      await listener.handleNoShow({
        payload: { reservationId: 'r4', clientId: 'c4', scheduledStart: after },
      } as never);
      await listener.handleCompleted({
        payload: {
          reservationId: 'r5',
          clientId: 'c5',
          treatmentId: 't5',
          categoryId: 'k5',
        },
      } as never);

      expect(enqueue.mock.calls).toEqual([
        [
          'reservation.rescheduled',
          {
            reservationId: 'r1',
            clientId: 'c1',
            previousScheduledStart: before,
            scheduledStart: after,
            rescheduledBy: 'CLIENT',
          },
        ],
        [
          'reservation.rescheduled',
          {
            reservationId: 'r2',
            clientId: 'c2',
            previousScheduledStart: before,
            scheduledStart: after,
            rescheduledBy: 'ADMIN',
          },
        ],
        [
          'reservation.cancelled',
          {
            reservationId: 'r3',
            clientId: 'c3',
            reason: 'Abono vencido',
            cancelledBy: 'TIMEOUT',
          },
        ],
        [
          'reservation.no_show',
          { reservationId: 'r4', clientId: 'c4', scheduledStart: after },
        ],
        [
          'reservation.completed',
          { reservationId: 'r5', clientId: 'c5', treatmentId: 't5' },
        ],
      ]);
      enqueue.mockRestore();
    });

    it.each([
      [
        'administrador sin avisar a la clienta',
        CancellationSource.ADMIN,
        false,
      ],
      ['administrador avisando a la clienta', CancellationSource.ADMIN, true],
      ['vencimiento del abono', CancellationSource.TIMEOUT, false],
    ])(
      'cancelar por %s publica exactamente un aviso para Conduit con su origen',
      async (_label, source, notifyClient) => {
        const { reservation } = await book();
        const seen: unknown[] = [];
        const capture = (event: { payload: unknown }) =>
          seen.push(event.payload);
        events.on(EVENT_TYPES.RESERVATION_CANCELLED_BY_BUSINESS, capture);
        await moduleRef
          .get(AdminCancelReservationOrchestrator)
          .execute(reservation.id, 'Motivo de prueba', notifyClient, source);
        events.off(EVENT_TYPES.RESERVATION_CANCELLED_BY_BUSINESS, capture);

        expect(seen).toEqual([
          {
            reservationId: reservation.id,
            clientId: reservation.clientId,
            source,
            reason: 'Motivo de prueba',
          },
        ]);
      },
    );
  });

  describe('Redis sin responder', () => {
    it('crear una reserva no se bloquea esperando a Redis: responde y deja la reserva guardada', async () => {
      fakeQueues.timeouts.hangNext = true;
      const startedAt = Date.now();
      const { reservation } = await book();
      const elapsed = Date.now() - startedAt;

      expect(elapsed).toBeLessThan(ENQUEUE_WAIT_MS + 1_500);
      const stored = await prisma.client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(stored.status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
      expect(stored.depositExpiresAt).not.toBeNull();
    });
  });

  describe('comunicaciones', () => {
    it('un recordatorio duplicado no envía dos WhatsApp y el envío usa clave de idempotencia estable por job', async () => {
      const { client, reservation } = await book(
        world.principal.simpleTreatmentId,
      );
      await approve.execute({
        reservationId: reservation.id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 10,
      });
      const sent: { idempotencyKey: string; phone: string }[] = [];
      const conduit = {
        sendWhatsappMessage: (p: { idempotencyKey: string; phone: string }) => {
          sent.push({ idempotencyKey: p.idempotencyKey, phone: p.phone });
          return Promise.resolve({ delivered: true, messageId: 'm1' });
        },
      };
      const comms = new AutomationCommunicationsProcessor(
        moduleRef.get(ReservationsRepository),
        conduit as unknown as ConduitApiClient,
        executions,
        prisma,
        { hasMarketingConsent: () => Promise.resolve(true) } as never,
        {} as never,
        { resolve: () => Promise.resolve('tpl-1') } as never,
        {} as never,
      );
      const reminder = job(
        JOB_NAMES.RESERVATION_REMINDER_CHECK,
        {
          reservationId: reservation.id,
          scheduledStart: reservation.scheduledStart.toISOString(),
        },
        { queueName: QUEUE_NAMES.AUTOMATION_COMMUNICATIONS, id: 'reminder-1' },
      );

      await comms.process(reminder);
      await comms.process(reminder);

      expect(sent).toHaveLength(1);
      expect(sent[0].phone).toBe(client.phone);
      expect(fakeQueues.communications.jobs).toEqual([]);
    });
  });
});
