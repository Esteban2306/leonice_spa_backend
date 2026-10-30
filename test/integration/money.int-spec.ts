import { TestingModule } from '@nestjs/testing';
import {
  DepositCoverage,
  DepositStatus,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { AdminCancelReservationOrchestrator } from 'src/reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from 'src/reservations/orchestrators/mark-no-show.orchestrator';
import { ConfirmDepositOrchestrator } from 'src/reservations/orchestrators/confirm-deposit.orchestrator';
import { ApproveDepositOrchestrator } from 'src/deposits/orchestrator/approve-deposit.orchestrator';
import { RejectDepositOrchestrator } from 'src/deposits/orchestrator/reject-deposit.orchestrator';
import { SubmitDepositProofOrchestrator } from 'src/deposits/orchestrator/submit-deposit-proof.orchestrator';
import { SUPERSEDED_PROOF_REASON } from 'src/deposits/orchestrator/submit-deposit-proof.orchestrator';
import { ManualDepositVerificationStrategy } from 'src/deposits/strategies/manual-deposit-verification.strategy';
import { DepositsRepository } from 'src/deposits/repositories/deposits.repositories';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { DepositCreditService } from 'src/reservations/service/deposit-credit.service';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
import {
  createHarnessModule,
  expectAppCode,
  fakeQueues,
  futureSlot,
  interceptNthCall,
  newClientDto,
  resetDatabase,
  seedWorld,
  settle,
  World,
} from './harness';

describe('4. Anticipos, vencimientos, rechazos, créditos y devoluciones', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  let approve: ApproveDepositOrchestrator;
  let reject: RejectDepositOrchestrator;
  let submit: SubmitDepositProofOrchestrator;
  let strategy: ManualDepositVerificationStrategy;
  let adminCancel: AdminCancelReservationOrchestrator;
  let noShow: MarkNoShowOrchestrator;
  let credits: DepositCreditService;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
    approve = moduleRef.get(ApproveDepositOrchestrator);
    reject = moduleRef.get(RejectDepositOrchestrator);
    submit = moduleRef.get(SubmitDepositProofOrchestrator);
    strategy = moduleRef.get(ManualDepositVerificationStrategy);
    adminCancel = moduleRef.get(AdminCancelReservationOrchestrator);
    noShow = moduleRef.get(MarkNoShowOrchestrator);
    credits = moduleRef.get(DepositCreditService);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await moduleRef.close();
  });

  let dayCursor = 3;
  const nextDay = () => dayCursor++;

  const book = async (
    treatmentIds: string[],
    client = newClientDto('din'),
    day = nextDay(),
    hour = 9,
  ) => {
    const result = await create.execute({
      client,
      treatments: treatmentIds,
      scheduledStart: futureSlot(day, hour).toISOString(),
    });
    return { client, ...result };
  };

  const sendProof = (reservationId: string, phone: string) =>
    submit.execute({
      strategy,
      reservationId,
      phone,
      fileBuffer: Buffer.from('comprobante'),
    });

  const approveOne = (reservationId: string, amount = 25) =>
    approve.execute({
      reservationId,
      adminUserId: world.admin.id,
      coverage: DepositCoverage.ANTICIPO,
      amount,
    });

  const depositsOf = (reservationId: string) =>
    prisma.client.depositRecord.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'asc' },
    });

  const reservationOf = (id: string) =>
    prisma.client.reservation.findUniqueOrThrow({ where: { id } });

  describe('aprobación', () => {
    it('confirma el comprobante con monto exacto, auditor y estado, y la reserva pasa a CONFIRMADA', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);

      await approveOne(id, 12.5);

      const [deposit] = await depositsOf(id);
      expect(deposit.status).toBe(DepositStatus.CONFIRMADO);
      expect(Number(deposit.amount)).toBe(12.5);
      expect(deposit.verifiedByUserId).toBe(world.admin.id);
      expect(deposit.verifiedAt).not.toBeNull();
      expect((await reservationOf(id)).status).toBe(
        ReservationStatus.CONFIRMADA,
      );
    });

    it('aprobar dos veces no duplica dinero: el segundo intento se rechaza y hay un solo depósito confirmado', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      await approveOne(id);
      await expect(approveOne(id)).rejects.toThrow();
      const confirmed = (await depositsOf(id)).filter(
        (d) => d.status === DepositStatus.CONFIRMADO,
      );
      expect(confirmed).toHaveLength(1);
    });

    it('sin comprobante y sin monto la administradora confirma la cita sin registrar dinero', async () => {
      const { reservations } = await book([world.secondary.treatmentId]);
      const id = reservations[0].id;

      const result = await approve.execute({
        reservationId: id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
      });

      expect(result.approvedReservationIds).toEqual([id]);
      expect(result.depositId).toBeNull();
      expect((await reservationOf(id)).status).toBe(
        ReservationStatus.CONFIRMADA,
      );
      expect(await depositsOf(id)).toHaveLength(0);
    });

    it('sin monto responde DEPOSIT_AMOUNT_REQUIRED y no cambia nada (rollback)', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);

      await expectAppCode(
        approve.execute({
          reservationId: id,
          adminUserId: world.admin.id,
          coverage: DepositCoverage.ANTICIPO,
        }),
        'DEPOSIT_AMOUNT_REQUIRED',
      );
      expect((await reservationOf(id)).status).toBe(
        ReservationStatus.PENDIENTE_DEPOSITO,
      );
      expect((await depositsOf(id))[0].status).toBe(DepositStatus.PENDIENTE);
    });

    it('un combo aprobado en grupo registra un solo pago y marca las demás reservas como cubiertas por él', async () => {
      const { client, reservations } = await book([
        world.principal.simpleTreatmentId,
        world.secondary.treatmentId,
      ]);
      await sendProof(reservations[0].id, client.phone);

      const result = await approveOne(reservations[0].id, 40);

      expect(result.approvedReservationIds).toHaveLength(2);
      const rows = await prisma.client.depositRecord.findMany({
        where: { reservationId: { in: reservations.map((r) => r.id) } },
      });
      const confirmed = rows.filter(
        (d) => d.status === DepositStatus.CONFIRMADO,
      );
      expect(confirmed).toHaveLength(1);
      expect(Number(confirmed[0].amount)).toBe(40);
      const second = await reservationOf(reservations[1].id);
      expect(second.status).toBe(ReservationStatus.CONFIRMADA);
      expect(second.coveredByDepositId).toBe(confirmed[0].id);
    });

    it('si falla la confirmación de un miembro del combo se revierte todo: ninguna reserva confirmada y ningún pago registrado', async () => {
      const { client, reservations } = await book([
        world.principal.simpleTreatmentId,
        world.secondary.treatmentId,
      ]);
      await sendProof(reservations[0].id, client.phone);
      const spy = interceptNthCall(
        moduleRef.get(ConfirmDepositOrchestrator),
        'confirmStatus',
        2,
        () => Promise.reject(new Error('fallo simulado')),
      );

      await expect(approveOne(reservations[0].id, 40)).rejects.toThrow(
        'fallo simulado',
      );
      spy.mockRestore();

      for (const r of reservations) {
        expect((await reservationOf(r.id)).status).toBe(
          ReservationStatus.PENDIENTE_DEPOSITO,
        );
      }
      const confirmed = await prisma.client.depositRecord.count({
        where: {
          reservationId: { in: reservations.map((r) => r.id) },
          status: DepositStatus.CONFIRMADO,
        },
      });
      expect(confirmed).toBe(0);
    });

    it('aprobar una reserva cancelada con comprobante pendiente confirma el pago para uso como crédito, sin resucitar la reserva', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      await adminCancel.execute(id, 'prueba', false);

      await approveOne(id, 30);

      expect((await reservationOf(id)).status).toBe(
        ReservationStatus.CANCELADA,
      );
      const summary = await credits.summarizeForClient(
        reservations[0].clientId,
      );
      expect(summary.credits.map((c) => c.amount)).toEqual([30]);
    });
  });

  describe('rechazo', () => {
    it('marca RECHAZADO con motivo, reinicia el plazo, reencola el vencimiento y la reserva sigue esperando depósito', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      const before = await reservationOf(id);
      fakeQueues.timeouts.jobs.length = 0;

      await reject.execute(id, world.admin.id, 'Comprobante ilegible');

      const [deposit] = await depositsOf(id);
      expect(deposit.status).toBe(DepositStatus.RECHAZADO);
      expect(deposit.rejectionReason).toBe('Comprobante ilegible');
      const after = await reservationOf(id);
      expect(after.status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
      expect(after.depositClockStartedAt!.getTime()).toBeGreaterThanOrEqual(
        before.depositClockStartedAt!.getTime(),
      );
      expect(after.depositExpiresAt!.getTime()).toBeGreaterThanOrEqual(
        before.depositExpiresAt!.getTime(),
      );
      expect(
        fakeQueues.timeouts.jobs.some(
          (j) => j.name === JOB_NAMES.DEPOSITO_TIMEOUT,
        ),
      ).toBe(true);
    });

    it('rechazar un comprobante ya procesado se rechaza (aprobado o rechazado)', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      await reject.execute(id, world.admin.id, 'No coincide');
      await expect(
        reject.execute(id, world.admin.id, 'otra vez'),
      ).rejects.toThrow();

      const other = await book([world.secondary.treatmentId]);
      await sendProof(other.reservations[0].id, other.client.phone);
      await approveOne(other.reservations[0].id);
      await expect(
        reject.execute(other.reservations[0].id, world.admin.id, 'tarde'),
      ).rejects.toThrow();
      expect((await depositsOf(other.reservations[0].id))[0].status).toBe(
        DepositStatus.CONFIRMADO,
      );
    });

    it('tras un rechazo el cliente puede reenviar y el admin aprobar el nuevo comprobante', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      await reject.execute(id, world.admin.id, 'borroso');
      await sendProof(id, client.phone);
      await approveOne(id, 20);
      const deposits = await depositsOf(id);
      expect(deposits.map((d) => d.status)).toEqual([
        DepositStatus.RECHAZADO,
        DepositStatus.CONFIRMADO,
      ]);
      expect((await reservationOf(id)).status).toBe(
        ReservationStatus.CONFIRMADA,
      );
    });

    it('el rechazo es atómico: si falla reiniciar el plazo, el comprobante sigue PENDIENTE y el plazo intacto', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      const before = await reservationOf(id);
      jest
        .spyOn(
          moduleRef.get(ReservationsRepository),
          'restartDepositDeadlineIfAwaiting',
        )
        .mockRejectedValueOnce(new Error('db caída'));
      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(reject.execute(id, world.admin.id, 'x')).rejects.toThrow(
        'db caída',
      );

      const after = await reservationOf(id);
      expect(after.depositClockStartedAt?.getTime()).toBe(
        before.depositClockStartedAt?.getTime(),
      );
      expect(after.depositExpiresAt?.getTime()).toBe(
        before.depositExpiresAt?.getTime(),
      );
      expect((await depositsOf(id))[0].status).toBe(DepositStatus.PENDIENTE);
    });

    it('el rechazo es atómico: si falla marcar el rechazo, el plazo de depósito no queda reiniciado', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await sendProof(id, client.phone);
      const before = await reservationOf(id);
      jest
        .spyOn(moduleRef.get(DepositsRepository), 'markRejectedIfPending')
        .mockRejectedValueOnce(new Error('db caída'));
      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(reject.execute(id, world.admin.id, 'x')).rejects.toThrow(
        'db caída',
      );

      const after = await reservationOf(id);
      expect(after.depositExpiresAt?.getTime()).toBe(
        before.depositExpiresAt?.getTime(),
      );
      expect((await depositsOf(id))[0].status).toBe(DepositStatus.PENDIENTE);
    });

    it('aprobar y rechazar a la vez el mismo comprobante nunca deja reserva CONFIRMADA con pago RECHAZADO (25 rondas)', async () => {
      const violations: string[] = [];
      for (let round = 0; round < 25; round++) {
        const { client, reservations } = await book(
          [world.tertiary.treatmentId],
          newClientDto('carrera'),
          nextDay(),
          8,
        );
        const id = reservations[0].id;
        await sendProof(id, client.phone);
        await settle<unknown>([
          approveOne(id, 15),
          reject.execute(id, world.admin.id, 'carrera'),
        ]);

        const reservation = await reservationOf(id);
        const latest = (await depositsOf(id)).at(-1)!;
        if (
          reservation.status === ReservationStatus.CONFIRMADA &&
          latest.status !== DepositStatus.CONFIRMADO
        ) {
          violations.push(`${id}: ${reservation.status}/${latest.status}`);
        }
      }
      expect(violations).toEqual([]);
    });

    it('enviar el comprobante varias veces a la vez deja exactamente uno pendiente y los demás reemplazados', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      const { ok } = await settle(
        Array.from({ length: 5 }, () => sendProof(id, client.phone)),
      );
      expect(ok).toHaveLength(5);

      const deposits = await depositsOf(id);
      const pending = deposits.filter(
        (d) => d.status === DepositStatus.PENDIENTE,
      );
      expect(pending).toHaveLength(1);
      expect(deposits.at(-1)?.id).toBe(pending[0].id);
      for (const d of deposits.filter((x) => x.id !== pending[0].id)) {
        expect(d.status).toBe(DepositStatus.RECHAZADO);
        expect(d.rejectionReason).toBe(SUPERSEDED_PROOF_REASON);
        expect(d.verifiedAt).toBeNull();
        expect(d.verifiedByUserId).toBeNull();
      }
    });

    it('reenviar un comprobante reemplaza al pendiente anterior y la aprobación confirma el más reciente', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      const first = await sendProof(id, client.phone);
      const second = await sendProof(id, client.phone);

      await approveOne(id, 20);

      const byId = new Map((await depositsOf(id)).map((d) => [d.id, d]));
      expect(byId.get(first.id)?.status).toBe(DepositStatus.RECHAZADO);
      expect(byId.get(second.id)?.status).toBe(DepositStatus.CONFIRMADO);
      expect((await reservationOf(id)).status).toBe(
        ReservationStatus.CONFIRMADA,
      );
    });

    it('no acepta comprobantes para una reserva que ya no espera depósito', async () => {
      const { client, reservations } = await book([
        world.secondary.treatmentId,
      ]);
      const id = reservations[0].id;
      await adminCancel.execute(id, 'x', false);
      await expect(sendProof(id, client.phone)).rejects.toThrow();
      expect(await depositsOf(id)).toHaveLength(0);
    });
  });

  describe('créditos y devoluciones', () => {
    const confirmedAndCancelled = async (amount = 25, viaNoShow = false) => {
      const booked = await book([world.secondary.treatmentId]);
      const id = booked.reservations[0].id;
      await sendProof(id, booked.client.phone);
      await approveOne(id, amount);
      if (viaNoShow) await noShow.execute(id);
      else await adminCancel.execute(id, 'cliente avisó', false);
      return { ...booked, originId: id };
    };

    it('una reserva confirmada que se cancela deja su anticipo disponible como crédito, por el monto exacto', async () => {
      const { reservations } = await confirmedAndCancelled(25);
      const summary = await credits.summarizeForClient(
        reservations[0].clientId,
      );
      expect(summary.credits).toHaveLength(1);
      expect(summary.credits[0].amount).toBe(25);
    });

    it('un no-show también deja crédito', async () => {
      const { reservations } = await confirmedAndCancelled(18, true);
      const summary = await credits.summarizeForClient(
        reservations[0].clientId,
      );
      expect(summary.credits.map((c) => c.amount)).toEqual([18]);
    });

    it('una aprobación manual sin comprobante no genera crédito al cancelar', async () => {
      const { reservations } = await book([world.secondary.treatmentId]);
      await approveOne(reservations[0].id, 22);
      await adminCancel.execute(reservations[0].id, 'x', false);
      const summary = await credits.summarizeForClient(
        reservations[0].clientId,
      );
      expect(summary.credits).toHaveLength(0);
    });

    it('la nueva reserva usa el crédito: sin plazo de depósito, se aprueba sin pedir monto y el crédito queda consumido', async () => {
      const { client, reservations, originId } =
        await confirmedAndCancelled(25);
      const clientId = reservations[0].clientId;

      const next = await book([world.tertiary.treatmentId], client);
      const newId = next.reservations[0].id;
      expect(next.creditAppliedReservationIds).toEqual([newId]);
      const fresh = await reservationOf(newId);
      expect(fresh.depositExpiresAt).toBeNull();
      expect(fresh.depositClockStartedAt).toBeNull();
      const origin = (await depositsOf(originId))[0];
      expect(origin.appliedToReservationId).toBe(newId);
      expect((await credits.summarizeForClient(clientId)).credits).toHaveLength(
        0,
      );

      const result = await approve.execute({
        reservationId: newId,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
      });
      expect(result.depositId).toBeNull();
      expect((await reservationOf(newId)).status).toBe(
        ReservationStatus.CONFIRMADA,
      );
      expect((await credits.summarizeForClient(clientId)).credits).toHaveLength(
        0,
      );
      expect(
        await prisma.client.depositRecord.count({
          where: { reservationId: newId },
        }),
      ).toBe(0);
    });

    it('si la reserva que consumió el crédito se cancela antes de confirmarse, el crédito se libera y no se pierde dinero', async () => {
      const { client, reservations } = await confirmedAndCancelled(25);
      const clientId = reservations[0].clientId;
      const next = await book([world.tertiary.treatmentId], client);
      await adminCancel.execute(next.reservations[0].id, 'otra vez', false);

      const summary = await credits.summarizeForClient(clientId);
      expect(summary.credits.map((c) => c.amount)).toEqual([25]);

      const third = await book([world.secondary.treatmentId], client);
      expect(third.creditAppliedReservationIds).toHaveLength(1);
    });

    it('un crédito nunca se aplica a dos reservas: dos reservas simultáneas del mismo cliente, a lo sumo una lo usa', async () => {
      const { client, reservations } = await confirmedAndCancelled(25);
      const clientId = reservations[0].clientId;

      const { ok, failedCodes } = await settle([
        book([world.tertiary.treatmentId], client, nextDay()),
        book([world.secondary.treatmentId], client, nextDay()),
      ]);

      const used = ok.flatMap((r) => r.value.creditAppliedReservationIds);
      expect(used.length).toBeLessThanOrEqual(1);
      const applied = await prisma.client.depositRecord.findMany({
        where: {
          appliedToReservationId: { not: null },
          reservation: { clientId },
        },
      });
      expect(applied).toHaveLength(1);
      expect(failedCodes.filter((c) => c !== 'CREDIT_ALREADY_APPLIED')).toEqual(
        [],
      );
      expect(ok.length + failedCodes.length).toBe(2);
    });

    it('un combo con crédito cubre todas sus reservas y se aprueba sin pago adicional', async () => {
      const { client } = await confirmedAndCancelled(60);
      const combo = await book(
        [world.principal.simpleTreatmentId, world.secondary.treatmentId],
        client,
      );
      expect(combo.creditAppliedReservationIds.length).toBeGreaterThan(0);

      const result = await approve.execute({
        reservationId: combo.reservations[0].id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
      });
      expect(result.approvedReservationIds).toHaveLength(2);
      expect(result.depositId).toBeNull();
    });

    it('conservación del dinero: el total de créditos disponibles nunca supera lo confirmado con comprobante', async () => {
      const confirmedWithProof = await prisma.client.depositRecord.aggregate({
        where: { status: DepositStatus.CONFIRMADO, imageUrl: { not: null } },
        _sum: { amount: true },
      });
      const clients = await prisma.client.client.findMany({
        select: { id: true },
      });
      let available = 0;
      for (const c of clients) {
        const summary = await credits.summarizeForClient(c.id);
        available += summary.credits.reduce(
          (acc, cr) => acc + (cr.amount ?? 0),
          0,
        );
      }
      expect(available).toBeLessThanOrEqual(
        Number(confirmedWithProof._sum.amount ?? 0),
      );
    });
  });
});
