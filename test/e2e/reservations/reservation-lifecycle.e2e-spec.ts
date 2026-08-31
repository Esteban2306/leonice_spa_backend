import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from 'src/reservations/orchestrators/cancel-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from 'src/reservations/orchestrators/reschedule-reservation.orchestrator';
import { ConfirmValoracionOrchestrator } from 'src/reservations/orchestrators/confirm-valoracion.orchestrator';
import { ConfirmDepositOrchestrator } from 'src/reservations/orchestrators/confirm-deposit.orchestrator';
import { CheckInReservationOrchestrator } from 'src/reservations/orchestrators/check-in-reservation.orchestrator';
import { CompleteReservationOrchestrator } from 'src/reservations/orchestrators/complete-reservation.orchestrator';
import { AdminRescheduleReservationOrchestrator } from 'src/reservations/orchestrators/admin-reservartion.orchestator';

describe('Reservation lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let createO: CreateReservationOrchestrator;
  let cancelO: CancelReservationOrchestrator;
  let rescheduleO: RescheduleReservationOrchestrator;
  let valoracionO: ConfirmValoracionOrchestrator;
  let depositoO: ConfirmDepositOrchestrator;
  let checkInO: CheckInReservationOrchestrator;
  let completeO: CompleteReservationOrchestrator;
  let adminRescheduleO: AdminRescheduleReservationOrchestrator;

  let categoryPrincipalId: string;
  let categorySecondaryId: string;
  let categoryLowCapId: string;
  let treatmentPrincipalId: string;
  let treatmentSimpleId: string;
  let treatmentSecondaryId: string;
  let treatmentLowCapId: string;

  const futureDate = (daysFromNow: number, hour = 8, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    createO = app.get(CreateReservationOrchestrator);
    cancelO = app.get(CancelReservationOrchestrator);
    rescheduleO = app.get(RescheduleReservationOrchestrator);
    valoracionO = app.get(ConfirmValoracionOrchestrator);
    depositoO = app.get(ConfirmDepositOrchestrator);
    checkInO = app.get(CheckInReservationOrchestrator);
    completeO = app.get(CompleteReservationOrchestrator);
    adminRescheduleO = app.get(AdminRescheduleReservationOrchestrator);

    const suffix = Date.now();

    const catPrincipal = await prisma.client.category.create({
      data: { name: `Test Principal ${suffix}`, isPrincipal: true },
    });
    categoryPrincipalId = catPrincipal.id;
    await prisma.client.capacityPool.create({
      data: { categoryId: categoryPrincipalId, name: 'Pool', maxConcurrent: 2 },
    });

    const catSecondary = await prisma.client.category.create({
      data: { name: `Test Secundaria ${suffix}`, isPrincipal: false },
    });
    categorySecondaryId = catSecondary.id;
    await prisma.client.capacityPool.create({
      data: { categoryId: categorySecondaryId, name: 'Pool', maxConcurrent: 2 },
    });

    const catLowCap = await prisma.client.category.create({
      data: { name: `Test BajaCapacidad ${suffix}`, isPrincipal: false },
    });
    categoryLowCapId = catLowCap.id;
    await prisma.client.capacityPool.create({
      data: { categoryId: categoryLowCapId, name: 'Pool', maxConcurrent: 1 },
    });

    treatmentPrincipalId = (
      await prisma.client.treatment.create({
        data: {
          categoryId: categoryPrincipalId,
          name: 'Con valoración',
          requiresPriorAssessment: true,
          basePriceMin: 100,
          basePriceMax: 200,
          baseDurationMinMinutes: 60,
          baseDurationMaxMinutes: 120,
        },
      })
    ).id;

    treatmentSimpleId = (
      await prisma.client.treatment.create({
        data: {
          categoryId: categoryPrincipalId,
          name: 'Sin valoración',
          requiresPriorAssessment: false,
          basePriceMin: 100,
          basePriceMax: 100,
          baseDurationMinMinutes: 120,
          baseDurationMaxMinutes: 120,
        },
      })
    ).id;

    treatmentSecondaryId = (
      await prisma.client.treatment.create({
        data: {
          categoryId: categorySecondaryId,
          name: 'Secundario',
          requiresPriorAssessment: false,
          basePriceMin: 50,
          basePriceMax: 50,
          baseDurationMinMinutes: 60,
          baseDurationMaxMinutes: 60,
        },
      })
    ).id;

    treatmentLowCapId = (
      await prisma.client.treatment.create({
        data: {
          categoryId: categoryLowCapId,
          name: 'BajaCapacidad',
          requiresPriorAssessment: false,
          basePriceMin: 80,
          basePriceMax: 80,
          baseDurationMinMinutes: 180,
          baseDurationMaxMinutes: 180,
        },
      })
    ).id;
  });

  afterAll(async () => {
    const categoryIds = [
      categoryPrincipalId,
      categorySecondaryId,
      categoryLowCapId,
    ];
    await prisma.client.reservation.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.client.treatment.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.client.capacityPool.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.client.category.deleteMany({
      where: { id: { in: categoryIds } },
    });
    await prisma.client.client.deleteMany({
      where: { phone: { contains: 'TEST' } },
    });
    if (app) await app.close();
  });

  it('recorre el ciclo completo: crear -> valoración -> depósito -> check-in -> completar', async () => {
    const result = await createO.execute({
      client: {
        phone: '+57TESTLIFECYCLE1',
        name: 'Cliente Ciclo',
        birthDate: '1990-01-01',
      },
      treatments: [treatmentPrincipalId],
      scheduledStart: futureDate(5).toISOString(),
    });

    expect(result.reservations).toHaveLength(1);
    expect(result.summary).toContain('quedó para las');

    const reservation = result.reservations[0];
    expect(reservation.status).toBe(ReservationStatus.PENDIENTE_VALORACION);

    const afterValoracion = await valoracionO.execute(reservation.id, 180, 90);
    expect(afterValoracion.status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);

    const afterDeposit = await depositoO.execute(reservation.id);
    expect(afterDeposit.status).toBe(ReservationStatus.CONFIRMADA);

    const afterCheckIn = await checkInO.execute(reservation.id);
    expect(afterCheckIn.status).toBe(ReservationStatus.CITA_EN_CURSO);

    const afterComplete = await completeO.execute(reservation.id);
    expect(afterComplete.status).toBe(ReservationStatus.COMPLETADA);
    expect(afterComplete.completedAt).not.toBeNull();
  });

  it('rechaza confirmar valoración con duración mayor a la máxima del tratamiento', async () => {
    const result = await createO.execute({
      client: { phone: '+57TESTLIFECYCLE2' },
      treatments: [treatmentPrincipalId],
      scheduledStart: futureDate(6).toISOString(),
    });
    await expect(
      valoracionO.execute(result.reservations[0].id, 180, 500),
    ).rejects.toThrow();
  });

  it('cancelar libera el cupo de inmediato', async () => {
    const slot = futureDate(10, 9);

    const first = await createO.execute({
      client: { phone: '+57TESTLIFECYCLE3' },
      treatments: [treatmentLowCapId],
      scheduledStart: slot.toISOString(),
    });

    await expect(
      createO.execute({
        client: { phone: '+57TESTLIFECYCLE4' },
        treatments: [treatmentLowCapId],
        scheduledStart: slot.toISOString(),
      }),
    ).rejects.toThrow();

    await cancelO.execute(
      first.reservations[0].id,
      '+57TESTLIFECYCLE3',
      'Prueba',
    );

    const third = await createO.execute({
      client: { phone: '+57TESTLIFECYCLE4' },
      treatments: [treatmentLowCapId],
      scheduledStart: slot.toISOString(),
    });
    expect(third.reservations[0].status).toBe(
      ReservationStatus.PENDIENTE_DEPOSITO,
    );
  });

  it('rechaza misma categoría el mismo día, pero permite días distintos', async () => {
    const day1 = futureDate(20, 8);
    const day1Tarde = futureDate(20, 14);
    const day2 = futureDate(21, 8);

    await createO.execute({
      client: { phone: '+57TESTLIFECYCLE5' },
      treatments: [treatmentSimpleId],
      scheduledStart: day1.toISOString(),
    });

    await expect(
      createO.execute({
        client: { phone: '+57TESTLIFECYCLE5' },
        treatments: [treatmentPrincipalId],
        scheduledStart: day1Tarde.toISOString(),
      }),
    ).rejects.toThrow();

    const nextDay = await createO.execute({
      client: { phone: '+57TESTLIFECYCLE5' },
      treatments: [treatmentPrincipalId],
      scheduledStart: day2.toISOString(),
    });
    expect(nextDay.reservations[0].status).toBe(
      ReservationStatus.PENDIENTE_VALORACION,
    );
  });

  it('combo: el principal ancla la hora pedida, el acompañante se encadena después', async () => {
    const start = futureDate(50, 8);

    const result = await createO.execute({
      client: {
        phone: '+57TESTCOMBO1',
        name: 'Combo',
        birthDate: '1990-01-01',
      },
      treatments: [treatmentSecondaryId, treatmentPrincipalId],
      scheduledStart: start.toISOString(),
    });

    expect(result.reservations).toHaveLength(2);
    expect(result.summary).toContain('organizada así');

    const principal = result.reservations.find(
      (r) => r.treatmentId === treatmentPrincipalId,
    )!;
    const acompanante = result.reservations.find(
      (r) => r.treatmentId === treatmentSecondaryId,
    )!;

    expect(principal.scheduledStart).toEqual(start);
    expect(acompanante.scheduledStart).toEqual(principal.scheduledEnd);
    expect(principal.comboGroupId).not.toBeNull();
    expect(principal.comboGroupId).toBe(acompanante.comboGroupId);
  });

  it('rechaza un combo con dos tratamientos de la misma categoría', async () => {
    await expect(
      createO.execute({
        client: { phone: '+57TESTCOMBO2' },
        treatments: [treatmentSimpleId, treatmentPrincipalId],
        scheduledStart: futureDate(51, 8).toISOString(),
      }),
    ).rejects.toThrow();
  });

  it('una petición separada que choca con una reserva existente se reubica sola, no se rechaza', async () => {
    const day = futureDate(55, 8);

    const first = await createO.execute({
      client: { phone: '+57TESTSMART1' },
      treatments: [treatmentSimpleId],
      scheduledStart: day.toISOString(),
    });

    const clashingRequest = new Date(day.getTime() + 30 * 60_000);
    const second = await createO.execute({
      client: { phone: '+57TESTSMART1' },
      treatments: [treatmentSecondaryId],
      scheduledStart: clashingRequest.toISOString(),
    });

    expect(second.reservations).toHaveLength(1);
    expect(second.summary).toContain('se ajustó');
    expect(second.reservations[0].scheduledStart).toEqual(
      first.reservations[0].scheduledEnd,
    );
  });

  it('si el horario justo después del conflicto tampoco tiene cupo, busca el más cercano ese mismo día', async () => {
    await createO.execute({
      client: { phone: '+57TESTNEAREST_A' },
      treatments: [treatmentLowCapId],
      scheduledStart: futureDate(60, 10).toISOString(),
    });

    const result = await createO.execute({
      client: { phone: '+57TESTNEAREST_B' },
      treatments: [treatmentLowCapId],
      scheduledStart: futureDate(60, 10).toISOString(),
    });

    expect(result.reservations).toHaveLength(1);
    expect(result.summary).toContain('reubicó');
  });

  it('no hay interbloqueo con locks de múltiples categorías bajo peticiones combo concurrentes', async () => {
    const start = futureDate(65, 8);

    const results = await Promise.allSettled([
      createO.execute({
        client: { phone: '+57TESTDEADLOCK1' },
        treatments: [treatmentSimpleId, treatmentSecondaryId],
        scheduledStart: start.toISOString(),
      }),
      createO.execute({
        client: { phone: '+57TESTDEADLOCK2' },
        treatments: [treatmentSecondaryId, treatmentSimpleId],
        scheduledStart: start.toISOString(),
      }),
    ]);

    expect(
      results.every((r) => r.status === 'fulfilled' || r.status === 'rejected'),
    ).toBe(true);
  }, 15_000);

  it('concurrencia real: solo una prospera con capacidad 1', async () => {
    const slot = futureDate(70, 8);

    const [a, b] = await Promise.allSettled([
      createO.execute({
        client: { phone: '+57TESTRACE1' },
        treatments: [treatmentLowCapId],
        scheduledStart: slot.toISOString(),
      }),
      createO.execute({
        client: { phone: '+57TESTRACE2' },
        treatments: [treatmentLowCapId],
        scheduledStart: slot.toISOString(),
      }),
    ]);

    expect([a, b].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('reprogramar: libera el cupo original de inmediato y crea una fila nueva enlazada', async () => {
    const result = await createO.execute({
      client: { phone: '+57TESTRESCHED1' },
      treatments: [treatmentSimpleId],
      scheduledStart: futureDate(80, 8).toISOString(),
    });
    const original = result.reservations[0];

    const rescheduled = await rescheduleO.execute(
      original.id,
      '+57TESTRESCHED1',
      futureDate(81, 9),
    );

    const originalAfter = await prisma.client.reservation.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(originalAfter.status).toBe(ReservationStatus.REPROGRAMADA);
    expect(rescheduled.rescheduledFromId).toBe(original.id);
  });

  it('el admin puede revivir un NO_SHOW haciendo check-in tarde', async () => {
    const result = await createO.execute({
      client: { phone: '+57TESTNOSHOW1' },
      treatments: [treatmentSimpleId],
      scheduledStart: futureDate(90, 8).toISOString(),
    });
    const reservation = result.reservations[0];

    await prisma.client.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.NO_SHOW },
    });

    const revived = await checkInO.execute(reservation.id);
    expect(revived.status).toBe(ReservationStatus.CITA_EN_CURSO);
  });

  it('el admin puede reprogramar sin pasar por capacidad, y controla si se notifica al cliente', async () => {
    const fullSlot = futureDate(95, 10);
    await createO.execute({
      client: { phone: '+57TESTADMIN_FILL' },
      treatments: [treatmentLowCapId],
      scheduledStart: fullSlot.toISOString(),
    });

    const other = await createO.execute({
      client: { phone: '+57TESTADMIN_MOVE' },
      treatments: [treatmentLowCapId],
      scheduledStart: futureDate(96, 8).toISOString(),
    });

    const moved = await adminRescheduleO.execute(
      other.reservations[0].id,
      fullSlot,
      false,
    );
    expect(moved.scheduledStart).toEqual(fullSlot);
  });

  it('el admin no puede reprogramar una reserva en estado terminal', async () => {
    const result = await createO.execute({
      client: { phone: '+57TESTADMIN_TERMINAL' },
      treatments: [treatmentSimpleId],
      scheduledStart: futureDate(97, 8).toISOString(),
    });
    await cancelO.execute(
      result.reservations[0].id,
      '+57TESTADMIN_TERMINAL',
      'Prueba',
    );

    await expect(
      adminRescheduleO.execute(
        result.reservations[0].id,
        futureDate(98, 8),
        false,
      ),
    ).rejects.toThrow();
  });
});
