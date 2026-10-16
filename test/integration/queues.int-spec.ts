import { TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, UnrecoverableError } from 'bullmq';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
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
import { ConduitOutboxService } from 'src/conduit/service/conduit-outbox.service';
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

    beforeAll(() => {
      outboxRepo = new ConduitOutboxRepository(prisma);
      const api = {
        pushBusinessEvent: (p: { eventId: string; eventType: string }) => {
          pushed.push({ eventId: p.eventId, eventType: p.eventType });
          return pushImpl();
        },
      } as unknown as ConduitApiClient;
      outboxProcessor = new ConduitOutboxProcessor(outboxRepo, api);
    });

    beforeEach(() => {
      pushed.length = 0;
      pushImpl = () => Promise.resolve();
    });

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

    it('si Redis falla al encolar, el evento queda PENDING en base y no se pierde (visible para reintento manual)', async () => {
      const queue = new FakeQueue('x');
      queue.failNext = true;
      const service = new ConduitOutboxService(outboxRepo, queue as never);
      await expect(
        service.enqueue('reservation.created', { a: 5 }),
      ).rejects.toThrow();
      const pending = await prisma.client.conduitOutboxEvent.findMany({
        where: { status: 'PENDING' },
      });
      expect(pending.length).toBeGreaterThan(0);
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
