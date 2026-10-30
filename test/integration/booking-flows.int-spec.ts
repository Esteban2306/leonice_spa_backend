import { ForbiddenException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DepositCoverage, ReservationStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from 'src/reservations/orchestrators/cancel-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from 'src/reservations/orchestrators/reschedule-reservation.orchestrator';
import { AdminRescheduleReservationOrchestrator } from 'src/reservations/orchestrators/admin-reservartion.orchestator';
import { AdminCancelReservationOrchestrator } from 'src/reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { CheckInReservationOrchestrator } from 'src/reservations/orchestrators/check-in-reservation.orchestrator';
import { ReservationSettlementService } from 'src/reservations/service/reservation-settlement.service';
import { CompleteReservationOrchestrator } from 'src/reservations/orchestrators/complete-reservation.orchestrator';
import { MarkNoShowOrchestrator } from 'src/reservations/orchestrators/mark-no-show.orchestrator';
import { ApproveDepositOrchestrator } from 'src/deposits/orchestrator/approve-deposit.orchestrator';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
import {
  createHarnessModule,
  expectAppCode,
  fakeQueues,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

describe('1. Flujos de reserva de principio a fin', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  let cancel: CancelReservationOrchestrator;
  let reschedule: RescheduleReservationOrchestrator;
  let adminReschedule: AdminRescheduleReservationOrchestrator;
  let adminCancel: AdminCancelReservationOrchestrator;
  let checkIn: CheckInReservationOrchestrator;
  let complete: CompleteReservationOrchestrator;
  let noShow: MarkNoShowOrchestrator;
  let approve: ApproveDepositOrchestrator;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
    cancel = moduleRef.get(CancelReservationOrchestrator);
    reschedule = moduleRef.get(RescheduleReservationOrchestrator);
    adminReschedule = moduleRef.get(AdminRescheduleReservationOrchestrator);
    adminCancel = moduleRef.get(AdminCancelReservationOrchestrator);
    checkIn = moduleRef.get(CheckInReservationOrchestrator);
    complete = moduleRef.get(CompleteReservationOrchestrator);
    noShow = moduleRef.get(MarkNoShowOrchestrator);
    approve = moduleRef.get(ApproveDepositOrchestrator);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const status = async (id: string) =>
    (await prisma.client.reservation.findUniqueOrThrow({ where: { id } }))
      .status;

  describe('reserva simple', () => {
    it('crea la reserva con precio, duración, plazo de depósito y job de vencimiento', async () => {
      fakeQueues.timeouts.jobs.length = 0;
      const client = newClientDto();
      const start = futureSlot(3, 10);
      const { reservations, summary } = await create.execute({
        client,
        treatments: [world.secondary.treatmentId],
        scheduledStart: start.toISOString(),
      });

      expect(reservations).toHaveLength(1);
      const r = reservations[0];
      expect(r.status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
      expect(Number(r.finalPrice)).toBe(50000);
      expect(r.finalDurationMinutes).toBe(60);
      expect(r.scheduledStart.getTime()).toBe(start.getTime());
      expect(r.scheduledEnd.getTime()).toBe(start.getTime() + 3_600_000);
      expect(r.comboGroupId).toBeNull();
      expect(r.depositExpiresAt).not.toBeNull();
      expect(r.depositExpiresAt!.getTime()).toBeLessThanOrEqual(
        start.getTime(),
      );
      expect(summary.length).toBeGreaterThan(0);

      const job = fakeQueues.timeouts.jobs.find(
        (j) =>
          j.name === JOB_NAMES.DEPOSITO_TIMEOUT &&
          (j.data as { reservationId: string }).reservationId === r.id,
      );
      expect(job).toBeDefined();
    });

    it('rechaza tratamientos inexistentes sin dejar rastro', async () => {
      const before = await prisma.client.reservation.count();
      await expect(
        create.execute({
          client: newClientDto(),
          treatments: ['00000000-0000-4000-8000-000000000000'],
          scheduledStart: futureSlot(4, 10).toISOString(),
        }),
      ).rejects.toThrow();
      expect(await prisma.client.reservation.count()).toBe(before);
    });

    it('rechaza fechas con menos de 1 día o más de 90 días de anticipación', async () => {
      const soon = new Date(Date.now() + 2 * 3_600_000);
      await expect(
        create.execute({
          client: newClientDto(),
          treatments: [world.secondary.treatmentId],
          scheduledStart: soon.toISOString(),
        }),
      ).rejects.toThrow();
      await expect(
        create.execute({
          client: newClientDto(),
          treatments: [world.secondary.treatmentId],
          scheduledStart: futureSlot(120, 10).toISOString(),
        }),
      ).rejects.toThrow();
    });

    it('fuera del horario de atención no deja una reserva fuera de ventana', async () => {
      const result = await create
        .execute({
          client: newClientDto(),
          treatments: [world.secondary.treatmentId],
          scheduledStart: futureSlot(5, 22).toISOString(),
        })
        .then(
          (r) => ({ r }),
          (error: unknown) => ({ error }),
        );
      if ('r' in result) {
        const s = result.r.reservations[0];
        expect(s.scheduledStart.getHours()).toBeGreaterThanOrEqual(8);
        expect(
          s.scheduledEnd.getHours() * 60 + s.scheduledEnd.getMinutes(),
        ).toBeLessThanOrEqual(18 * 60);
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('combos', () => {
    it('encadena principal + secundario con el mismo comboGroupId, sin cruces y con un solo plazo', async () => {
      const client = newClientDto('combo');
      const start = futureSlot(6, 9);
      const { reservations } = await create.execute({
        client,
        treatments: [
          world.secondary.treatmentId,
          world.principal.simpleTreatmentId,
        ],
        scheduledStart: start.toISOString(),
      });

      expect(reservations).toHaveLength(2);
      const [first, second] = reservations;
      expect(first.categoryId).toBe(world.principal.categoryId);
      expect(first.scheduledStart.getTime()).toBe(start.getTime());
      expect(second.scheduledStart.getTime()).toBe(
        first.scheduledEnd.getTime(),
      );
      expect(first.comboGroupId).not.toBeNull();
      expect(second.comboGroupId).toBe(first.comboGroupId);
      expect(first.depositExpiresAt?.getTime()).toBe(
        second.depositExpiresAt?.getTime(),
      );
      expect(Number(first.finalPrice) + Number(second.finalPrice)).toBe(170000);
    });

    it('combo de tres categorías queda contiguo y sin solapes', async () => {
      const { reservations } = await create.execute({
        client: newClientDto('combo3'),
        treatments: [
          world.tertiary.treatmentId,
          world.secondary.treatmentId,
          world.principal.simpleTreatmentId,
        ],
        scheduledStart: futureSlot(7, 9).toISOString(),
      });
      expect(reservations).toHaveLength(3);
      for (let i = 1; i < reservations.length; i++) {
        expect(reservations[i].scheduledStart.getTime()).toBe(
          reservations[i - 1].scheduledEnd.getTime(),
        );
      }
    });

    it('rechaza combos con dos tratamientos de la misma categoría y combos con tratamientos repetidos', async () => {
      await expect(
        create.execute({
          client: newClientDto(),
          treatments: [
            world.principal.treatmentId,
            world.principal.simpleTreatmentId,
          ],
          scheduledStart: futureSlot(8, 9).toISOString(),
        }),
      ).rejects.toThrow();
      await expect(
        create.execute({
          client: newClientDto(),
          treatments: [
            world.secondary.treatmentId,
            world.secondary.treatmentId,
          ],
          scheduledStart: futureSlot(8, 9).toISOString(),
        }),
      ).rejects.toThrow();
    });

    it('un combo es atómico: si una categoría no tiene cupo ese día no queda ninguna reserva parcial', async () => {
      const day = 9;
      for (let hour = 8; hour < 18; hour++) {
        await create.execute({
          client: newClientDto('llenar'),
          treatments: [world.lowCap.treatmentId],
          scheduledStart: futureSlot(day, hour).toISOString(),
        });
      }
      const client = newClientDto('combo-atomico');
      await expect(
        create.execute({
          client,
          treatments: [world.secondary.treatmentId, world.lowCap.treatmentId],
          scheduledStart: futureSlot(day, 9).toISOString(),
        }),
      ).rejects.toThrow();
      const stored = await prisma.client.client.findUnique({
        where: { phone: client.phone },
      });
      const leftovers = stored
        ? await prisma.client.reservation.count({
            where: { clientId: stored.id },
          })
        : 0;
      expect(leftovers).toBe(0);
    });
  });

  describe('ciclo completo', () => {
    it('crear → aprobar depósito → check-in → completar', async () => {
      const start = futureSlot(10, 10);
      const { reservations } = await create.execute({
        client: newClientDto('ciclo'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: start.toISOString(),
      });
      const id = reservations[0].id;

      await approve.execute({
        reservationId: id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 25,
      });
      expect(await status(id)).toBe(ReservationStatus.CONFIRMADA);

      const checkInDay = new Date(start.getTime() + 5 * 60_000);
      await checkIn.execute(id, checkInDay);
      expect(await status(id)).toBe(ReservationStatus.CITA_EN_CURSO);

      const settlement = await moduleRef
        .get(ReservationSettlementService)
        .compute(id);
      expect(settlement.advance).toBe(25);
      expect(settlement.balanceDue).toBe(settlement.price - 25);

      await complete.execute({
        reservationId: id,
        adminUserId: world.admin.id,
        cashAmount: settlement.price - 25,
        transferAmount: 0,
      });
      const done = await prisma.client.reservation.findUniqueOrThrow({
        where: { id },
        include: { payment: true, siigoSync: true },
      });
      expect(done.status).toBe(ReservationStatus.COMPLETADA);
      expect(done.completedAt).not.toBeNull();
      expect(done.payment?.method).toBe('MIXTO');
      expect(done.payment?.advanceAmount.toNumber()).toBe(25);
      expect(done.siigoSync?.status).toBe('PENDIENTE');
      expect(
        (done.siigoSync?.payload as { amountCopThousands: number })
          .amountCopThousands,
      ).toBe(settlement.price);
    });

    it('no-show: CONFIRMADA → NO_SHOW libera el cupo y el admin puede atender tarde (check-in)', async () => {
      const start = futureSlot(11, 10);
      const { reservations } = await create.execute({
        client: newClientDto('noshow'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: start.toISOString(),
      });
      const id = reservations[0].id;
      await approve.execute({
        reservationId: id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 20,
      });

      await noShow.execute(id);
      expect(await status(id)).toBe(ReservationStatus.NO_SHOW);

      const other = await create.execute({
        client: newClientDto('toma-cupo'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: start.toISOString(),
      });
      expect(other.reservations[0].scheduledStart.getTime()).toBe(
        start.getTime(),
      );

      await checkIn.execute(id, new Date(start.getTime() + 20 * 60_000));
      expect(await status(id)).toBe(ReservationStatus.CITA_EN_CURSO);
    });
  });

  describe('reprogramación', () => {
    it('conserva el id y el estado, mueve el horario, libera el cupo viejo y reencola el no-show si estaba confirmada', async () => {
      const oldStart = futureSlot(12, 10);
      const newStart = futureSlot(13, 15);
      const client = newClientDto('repro');
      const { reservations } = await create.execute({
        client,
        treatments: [world.lowCap.treatmentId],
        scheduledStart: oldStart.toISOString(),
      });
      const r = reservations[0];
      await approve.execute({
        reservationId: r.id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 20,
      });
      fakeQueues.timeouts.jobs.length = 0;

      const moved = await reschedule.execute(r.id, client.phone, newStart);

      expect(moved.id).toBe(r.id);
      expect(moved.status).toBe(ReservationStatus.CONFIRMADA);
      expect(moved.scheduledStart.getTime()).toBe(newStart.getTime());
      expect(moved.scheduledEnd.getTime()).toBe(newStart.getTime() + 3_600_000);
      expect(
        fakeQueues.timeouts.jobs.some(
          (j) => j.name === JOB_NAMES.NO_SHOW_CHECK,
        ),
      ).toBe(true);

      const taker = await create.execute({
        client: newClientDto('toma-viejo'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: oldStart.toISOString(),
      });
      expect(taker.reservations[0].scheduledStart.getTime()).toBe(
        oldStart.getTime(),
      );
    });

    it('rechaza teléfono ajeno, mismo horario, horario sin cupo y estados terminales', async () => {
      const client = newClientDto('repro2');
      const start = futureSlot(14, 10);
      const { reservations } = await create.execute({
        client,
        treatments: [world.lowCap.treatmentId],
        scheduledStart: start.toISOString(),
      });
      const id = reservations[0].id;

      await expect(
        reschedule.execute(id, '+573000000000', futureSlot(15, 10)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expectAppCode(
        reschedule.execute(id, client.phone, start),
        'RESERVATION_RESCHEDULE_SAME_SLOT',
      );

      const blocker = await create.execute({
        client: newClientDto('bloquea'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: futureSlot(16, 11).toISOString(),
      });
      expect(blocker.reservations).toHaveLength(1);
      await expect(
        reschedule.execute(id, client.phone, futureSlot(16, 11)),
      ).rejects.toThrow();
      expect(
        (
          await prisma.client.reservation.findUniqueOrThrow({ where: { id } })
        ).scheduledStart.getTime(),
      ).toBe(start.getTime());

      await adminCancel.execute(id, 'prueba', false);
      await expectAppCode(
        adminReschedule.execute(id, futureSlot(17, 10), false),
        'RESERVATION_NOT_RESCHEDULABLE',
      );
    });

    it('el admin puede reprogramar a un horario libre y no puede a uno sin cupo', async () => {
      const { reservations } = await create.execute({
        client: newClientDto('admin-repro'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: futureSlot(18, 10).toISOString(),
      });
      const id = reservations[0].id;
      await create.execute({
        client: newClientDto('ocupa'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: futureSlot(18, 14).toISOString(),
      });

      await expect(
        adminReschedule.execute(id, futureSlot(18, 14), false),
      ).rejects.toThrow();
      const moved = await adminReschedule.execute(
        id,
        futureSlot(18, 16),
        false,
      );
      expect(moved.scheduledStart.getTime()).toBe(futureSlot(18, 16).getTime());
    });
  });

  describe('cancelaciones', () => {
    it('SINGLE cancela una sola reserva y libera el cupo; repetirlo es idempotente', async () => {
      const client = newClientDto('cancel');
      const start = futureSlot(19, 10);
      const { reservations } = await create.execute({
        client,
        treatments: [world.lowCap.treatmentId],
        scheduledStart: start.toISOString(),
      });
      const id = reservations[0].id;

      const first = await cancel.executeVerifiedByPhone({
        phone: client.phone,
        reservationId: id,
        scope: 'SINGLE',
        channel: 'WEB',
      });
      expect(first.cancelled).toHaveLength(1);
      expect(await status(id)).toBe(ReservationStatus.CANCELADA);

      const second = await cancel.executeVerifiedByPhone({
        phone: client.phone,
        reservationId: id,
        scope: 'SINGLE',
        channel: 'WEB',
      });
      expect(second.cancelled).toHaveLength(0);
      expect(second.alreadyCancelled).toHaveLength(1);

      const taker = await create.execute({
        client: newClientDto('toma'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: start.toISOString(),
      });
      expect(taker.reservations[0].scheduledStart.getTime()).toBe(
        start.getTime(),
      );
    });

    it('DAY cancela todo el combo del día en una sola transacción', async () => {
      const client = newClientDto('cancel-dia');
      const { reservations } = await create.execute({
        client,
        treatments: [
          world.principal.simpleTreatmentId,
          world.secondary.treatmentId,
        ],
        scheduledStart: futureSlot(20, 9).toISOString(),
      });
      const result = await cancel.executeVerifiedByPhone({
        phone: client.phone,
        reservationId: reservations[1].id,
        scope: 'DAY',
        channel: 'LINK',
      });
      expect(result.cancelled).toHaveLength(2);
      for (const r of reservations) {
        expect(await status(r.id)).toBe(ReservationStatus.CANCELADA);
      }
    });

    it('un cliente no puede cancelar la reserva de otro y no puede cancelar una ya iniciada', async () => {
      const owner = newClientDto('due');
      const { reservations } = await create.execute({
        client: owner,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(21, 10).toISOString(),
      });
      await expectAppCode(
        cancel.executeVerifiedByPhone({
          phone: '+573111111111',
          reservationId: reservations[0].id,
          scope: 'SINGLE',
          channel: 'WEB',
        }),
        'RESERVATION_NOT_OWNED',
      );
      await expectAppCode(
        cancel.execute(
          {
            clientId: reservations[0].clientId,
            reservationId: reservations[0].id,
            scope: 'SINGLE',
            channel: 'WEB',
          },
          new Date(reservations[0].scheduledStart.getTime() + 60_000),
        ),
        'RESERVATION_CANCEL_TOO_LATE',
      );
      expect(await status(reservations[0].id)).toBe(
        ReservationStatus.PENDIENTE_DEPOSITO,
      );
    });

    it('cancelación administrativa registra origen, motivo y fecha', async () => {
      const { reservations } = await create.execute({
        client: newClientDto('admin-cancel'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(22, 10).toISOString(),
      });
      await adminCancel.execute(reservations[0].id, 'Cambio de agenda', true);
      const row = await prisma.client.reservation.findUniqueOrThrow({
        where: { id: reservations[0].id },
      });
      expect(row.status).toBe(ReservationStatus.CANCELADA);
      expect(row.cancellationSource).toBe('ADMIN');
      expect(row.cancellationReason).toBe('Cambio de agenda');
      expect(row.cancelledAt).not.toBeNull();
    });
  });
});
