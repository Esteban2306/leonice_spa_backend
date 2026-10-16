import { TestingModule } from '@nestjs/testing';
import {
  CancellationSource,
  DepositCoverage,
  DepositStatus,
  ReservationStatus as S,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from 'src/reservations/orchestrators/cancel-reservation.orchestrator';
import { ReviveReservationOrchestrator } from 'src/reservations/orchestrators/revive-reservation.orchestrator';
import { AdminCancelReservationOrchestrator } from 'src/reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from 'src/reservations/orchestrators/reschedule-reservation.orchestrator';
import { DepositCreditService } from 'src/reservations/service/deposit-credit.service';
import { ApproveDepositOrchestrator } from 'src/deposits/orchestrator/approve-deposit.orchestrator';
import { DepositsRepository } from 'src/deposits/repositories/deposits.repositories';
import {
  createHarnessModule,
  expectAppCode,
  fakeQueues,
  futureSlot,
  interceptNthCall,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

describe('5. Operaciones críticas transaccionales y fallos parciales', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  let counter = 0;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const nextSlot = () => {
    const n = counter++;
    return futureSlot(3 + (n % 40), 8 + (Math.floor(n / 40) % 9));
  };

  const book = (treatmentIds: string[], client = newClientDto('tx')) =>
    create
      .execute({
        client,
        treatments: treatmentIds,
        scheduledStart: nextSlot().toISOString(),
      })
      .then((r) => ({ client, ...r }));

  const statusOf = async (id: string) =>
    (await prisma.client.reservation.findUniqueOrThrow({ where: { id } }))
      .status;

  it('crear: si Redis falla al encolar el vencimiento la reserva queda creada igualmente (lo cubre el barrido)', async () => {
    fakeQueues.timeouts.failNext = true;
    const { reservations } = await book([world.secondary.treatmentId]);
    expect(await statusOf(reservations[0].id)).toBe(S.PENDIENTE_DEPOSITO);
  });

  it('aprobar: si Redis falla al encolar el no-show la aprobación queda confirmada y no se revierte', async () => {
    const { reservations } = await book([world.secondary.treatmentId]);
    fakeQueues.timeouts.failNext = true;
    await moduleRef.get(ApproveDepositOrchestrator).execute({
      reservationId: reservations[0].id,
      adminUserId: world.admin.id,
      coverage: DepositCoverage.ANTICIPO,
      amount: 10,
    });
    expect(await statusOf(reservations[0].id)).toBe(S.CONFIRMADA);
  });

  it('aprobar: si falla registrar el pago, la reserva no queda confirmada (rollback)', async () => {
    const { reservations } = await book([world.secondary.treatmentId]);
    jest
      .spyOn(moduleRef.get(DepositsRepository), 'createConfirmedWithoutProof')
      .mockRejectedValueOnce(new Error('db caída'));

    await expect(
      moduleRef.get(ApproveDepositOrchestrator).execute({
        reservationId: reservations[0].id,
        adminUserId: world.admin.id,
        coverage: DepositCoverage.ANTICIPO,
        amount: 10,
      }),
    ).rejects.toThrow('db caída');

    expect(await statusOf(reservations[0].id)).toBe(S.PENDIENTE_DEPOSITO);
    expect(
      await prisma.client.depositRecord.count({
        where: { reservationId: reservations[0].id },
      }),
    ).toBe(0);
  });

  it('crear con crédito: si falla aplicar el crédito no queda ninguna reserva ni crédito consumido (rollback)', async () => {
    const client = newClientDto('credito-tx');
    const origin = await book([world.secondary.treatmentId], client);
    const deposit = await prisma.client.depositRecord.create({
      data: {
        reservationId: origin.reservations[0].id,
        status: DepositStatus.CONFIRMADO,
        method: 'MANUAL',
        coverage: DepositCoverage.ANTICIPO,
        amount: 30,
        imageUrl: 'https://fake.test/p.webp',
        verifiedAt: new Date(),
      },
    });
    await moduleRef
      .get(AdminCancelReservationOrchestrator)
      .execute(origin.reservations[0].id, 'x', false);
    const before = await prisma.client.reservation.count();
    jest
      .spyOn(
        (create as unknown as { depositCredit: DepositCreditService })
          .depositCredit,
        'applyToReservation',
      )
      .mockResolvedValueOnce(false);

    await expectAppCode(
      book([world.tertiary.treatmentId], client),
      'CREDIT_ALREADY_APPLIED',
    );

    expect(await prisma.client.reservation.count()).toBe(before);
    expect(
      (
        await prisma.client.depositRecord.findUniqueOrThrow({
          where: { id: deposit.id },
        })
      ).appliedToReservationId,
    ).toBeNull();
  });

  it('cancelar el día completo es todo-o-nada: si una reserva cambia a mitad, ninguna queda cancelada', async () => {
    const client = newClientDto('dia-tx');
    const when = nextSlot();
    const combo = await create.execute({
      client,
      treatments: [
        world.principal.simpleTreatmentId,
        world.secondary.treatmentId,
      ],
      scheduledStart: when.toISOString(),
    });
    interceptNthCall(
      moduleRef.get(ReservationsRepository),
      'updateStatusIfCurrent',
      2,
      () => Promise.resolve(false),
    );

    await expectAppCode(
      moduleRef.get(CancelReservationOrchestrator).executeVerifiedByPhone({
        phone: client.phone,
        reservationId: combo.reservations[0].id,
        scope: 'DAY',
        channel: 'WEB',
      }),
      'RESERVATION_CONCURRENT_CHANGE',
    );

    for (const r of combo.reservations)
      expect(await statusOf(r.id)).toBe(S.PENDIENTE_DEPOSITO);
  });

  it('revivir un combo es todo-o-nada: si falla una reserva, todas siguen canceladas', async () => {
    const combo = await book([
      world.principal.simpleTreatmentId,
      world.secondary.treatmentId,
    ]);
    await prisma.client.reservation.updateMany({
      where: { id: { in: combo.reservations.map((r) => r.id) } },
      data: {
        status: S.CANCELADA,
        cancellationSource: CancellationSource.TIMEOUT,
      },
    });
    interceptNthCall(
      moduleRef.get(ReservationsRepository),
      'updateStatusIfCurrent',
      2,
      () => Promise.resolve(false),
    );

    await expect(
      moduleRef
        .get(ReviveReservationOrchestrator)
        .execute(combo.reservations[0].id),
    ).rejects.toThrow();

    for (const r of combo.reservations)
      expect(await statusOf(r.id)).toBe(S.CANCELADA);
  });

  it('reagendar: si falla la actualización no cambia el horario y el cupo original sigue ocupado', async () => {
    const { client, reservations } = await book([world.lowCap.treatmentId]);
    const original = reservations[0];
    const repo = moduleRef.get(ReservationsRepository);
    jest
      .spyOn(repo, 'updateScheduleIfCurrent')
      .mockRejectedValueOnce(new Error('db caída'));

    await expect(
      moduleRef
        .get(RescheduleReservationOrchestrator)
        .execute(original.id, client.phone, futureSlot(70, 10)),
    ).rejects.toThrow('db caída');

    const after = await prisma.client.reservation.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(after.scheduledStart.getTime()).toBe(
      original.scheduledStart.getTime(),
    );
    expect(after.status).toBe(S.PENDIENTE_DEPOSITO);
  });
});
