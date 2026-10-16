import { TestingModule } from '@nestjs/testing';
import {
  DepositCoverage,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AvailabilityRepository } from 'src/reservations/repositories/availability.repository';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from 'src/reservations/orchestrators/reschedule-reservation.orchestrator';
import { getCalendarDayKey } from 'src/reservations/domain/calendar-day-key';
import { AdminRescheduleReservationOrchestrator } from 'src/reservations/orchestrators/admin-reservartion.orchestator';
import {
  createHarnessModule,
  futureSlot,
  maxConcurrency,
  newClientDto,
  resetDatabase,
  seedWorld,
  settle,
  World,
} from './harness';

describe('2. Disponibilidad y concurrencia', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  let availability: AvailabilityRepository;
  let reschedule: RescheduleReservationOrchestrator;
  let adminReschedule: AdminRescheduleReservationOrchestrator;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
    availability = moduleRef.get(AvailabilityRepository);
    reschedule = moduleRef.get(RescheduleReservationOrchestrator);
    adminReschedule = moduleRef.get(AdminRescheduleReservationOrchestrator);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const book = (
    treatmentId: string,
    start: Date,
    client = newClientDto('conc'),
  ) =>
    create.execute({
      client,
      treatments: [treatmentId],
      scheduledStart: start.toISOString(),
    });

  it('la disponibilidad se valida en el backend: nunca hay más reservas simultáneas que la capacidad (cap 1, 14 peticiones al mismo horario)', async () => {
    const start = futureSlot(3, 10);
    const { ok, failedCodes } = await settle(
      Array.from({ length: 14 }, () => book(world.lowCap.treatmentId, start)),
    );

    expect(await maxConcurrency(prisma.client, world.lowCap.categoryId)).toBe(
      1,
    );
    expect(ok.length).toBe(10);
    expect(failedCodes).toHaveLength(4);
    for (const code of failedCodes)
      expect(code).toBe('PLACEMENT_NO_SLOT_THAT_DAY');

    const starts = ok.map((r) =>
      r.value.reservations[0].scheduledStart.getTime(),
    );
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('capacidad 2: 12 peticiones simultáneas a la misma hora respetan el máximo de 2 en paralelo', async () => {
    const start = futureSlot(4, 10);
    const { ok } = await settle(
      Array.from({ length: 12 }, () =>
        book(world.secondary.treatmentId, start),
      ),
    );
    expect(ok.length).toBeGreaterThan(0);
    expect(
      await maxConcurrency(prisma.client, world.secondary.categoryId),
    ).toBeLessThanOrEqual(2);
  });

  it('attemptToHoldSlot: 20 intentos simultáneos con capacidad 1, exactamente uno gana', async () => {
    const start = futureSlot(5, 11);
    const end = new Date(start.getTime() + 3_600_000);
    const clients = await Promise.all(
      Array.from({ length: 20 }, () => {
        const dto = newClientDto('hold');
        return prisma.client.client.create({
          data: {
            phone: dto.phone,
            name: dto.name,
            birthDate: new Date(dto.birthDate),
          },
        });
      }),
    );
    const results = await Promise.all(
      clients.map((c) =>
        availability.attemptToHoldSlot({
          categoryId: world.lowCap.categoryId,
          treatmentId: world.lowCap.treatmentId,
          clientId: c.id,
          scheduledStart: start,
          scheduledEnd: end,
          finalPrice: 80000,
          finalDurationMinutes: 60,
        }),
      ),
    );
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await maxConcurrency(prisma.client, world.lowCap.categoryId)).toBe(
      1,
    );
  });

  it('el mismo cliente no puede duplicar categoría el mismo día aunque lance 6 peticiones a la vez', async () => {
    const client = newClientDto('duplicado');
    const start = futureSlot(6, 9);
    const { ok } = await settle(
      Array.from({ length: 6 }, () =>
        book(world.secondary.treatmentId, start, client),
      ),
    );
    expect(ok).toHaveLength(1);
    const stored = await prisma.client.client.findUniqueOrThrow({
      where: { phone: client.phone },
    });
    expect(
      await prisma.client.reservation.count({
        where: {
          clientId: stored.id,
          status: { not: ReservationStatus.CANCELADA },
        },
      }),
    ).toBe(1);
  });

  it('el mismo cliente no puede quedar en dos citas solapadas de categorías distintas lanzadas a la vez (30 rondas)', async () => {
    const overlaps: number[] = [];
    for (let round = 0; round < 30; round++) {
      const client = newClientDto('solape');
      const start = futureSlot(20 + round, 9);
      await settle([
        book(world.secondary.treatmentId, start, client),
        book(world.tertiary.treatmentId, start, client),
      ]);
      const stored = await prisma.client.client.findUniqueOrThrow({
        where: { phone: client.phone },
      });
      const rows = await prisma.client.reservation.findMany({
        where: { clientId: stored.id },
        orderBy: { scheduledStart: 'asc' },
      });
      for (let i = 1; i < rows.length; i++) {
        if (
          rows[i].scheduledStart.getTime() < rows[i - 1].scheduledEnd.getTime()
        ) {
          overlaps.push(round);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('dos reprogramaciones al último hueco libre: solo una gana', async () => {
    const day = 8;
    const reservations: Reservation[] = [];
    for (const hour of [8, 9]) {
      const r = await book(world.lowCap.treatmentId, futureSlot(day, hour));
      reservations.push(r.reservations[0]);
    }
    for (let hour = 11; hour < 18; hour++) {
      await book(world.lowCap.treatmentId, futureSlot(day, hour));
    }
    const target = futureSlot(day, 10);
    const phones = await Promise.all(
      reservations.map(
        async (r) =>
          (
            await prisma.client.client.findUniqueOrThrow({
              where: { id: r.clientId },
            })
          ).phone,
      ),
    );
    const { ok, failed } = await settle([
      reschedule.execute(reservations[0].id, phones[0], target),
      adminReschedule.execute(reservations[1].id, target, false),
    ]);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(await maxConcurrency(prisma.client, world.lowCap.categoryId)).toBe(
      1,
    );
  });

  it('una reprogramación y una reserva nueva compiten por el mismo hueco sin exceder la capacidad', async () => {
    const day = 9;
    const mine = await book(world.lowCap.treatmentId, futureSlot(day, 8));
    for (let hour = 10; hour < 18; hour++) {
      await book(world.lowCap.treatmentId, futureSlot(day, hour));
    }
    const target = futureSlot(day, 9);
    await settle<unknown>([
      adminReschedule.execute(mine.reservations[0].id, target, false),
      book(world.lowCap.treatmentId, target),
    ]);
    expect(await maxConcurrency(prisma.client, world.lowCap.categoryId)).toBe(
      1,
    );
  });

  it('cancelar y reservar a la vez nunca deja dos reservas activas en el mismo hueco', async () => {
    const day = 10;
    const start = futureSlot(day, 9);
    for (let round = 0; round < 5; round++) {
      const day2 = day + round;
      const s = futureSlot(day2, 9);
      const held = await book(world.lowCap.treatmentId, s);
      for (let hour = 10; hour < 18; hour++) {
        await book(world.lowCap.treatmentId, futureSlot(day2, hour));
      }
      await settle<unknown>([
        prisma.client.reservation.update({
          where: { id: held.reservations[0].id },
          data: { status: ReservationStatus.CANCELADA },
        }),
        book(world.lowCap.treatmentId, s),
      ]);
      expect(await maxConcurrency(prisma.client, world.lowCap.categoryId)).toBe(
        1,
      );
    }
    expect(start).toBeDefined();
  });

  it('un lock de combo con categorías en orden inverso no produce interbloqueos', async () => {
    const day = 16;
    const requests = Array.from({ length: 16 }, (_, i) =>
      create.execute({
        client: newClientDto(`dl${i}`),
        treatments:
          i % 2 === 0
            ? [world.secondary.treatmentId, world.tertiary.treatmentId]
            : [world.tertiary.treatmentId, world.secondary.treatmentId],
        scheduledStart: futureSlot(day, 8 + (i % 4)).toISOString(),
      }),
    );
    const { failedCodes } = await settle(requests);
    expect(failedCodes.filter((c) => /deadlock|40P01/i.test(c))).toHaveLength(
      0,
    );
    expect(
      await maxConcurrency(prisma.client, world.secondary.categoryId),
    ).toBeLessThanOrEqual(2);
    expect(
      await maxConcurrency(prisma.client, world.tertiary.categoryId),
    ).toBeLessThanOrEqual(2);
  });

  it('el estado final de cada combo concurrente es todo-o-nada', async () => {
    const day = 17;
    const requests = Array.from({ length: 10 }, (_, i) =>
      create.execute({
        client: newClientDto(`aon${i}`),
        treatments: [world.lowCap.treatmentId, world.secondary.treatmentId],
        scheduledStart: futureSlot(day, 8).toISOString(),
      }),
    );
    await settle(requests);
    const combos = await prisma.client.reservation.groupBy({
      by: ['comboGroupId'],
      where: {
        comboGroupId: { not: null },
        scheduledStart: { gte: futureSlot(day, 0), lt: futureSlot(day + 1, 0) },
      },
      _count: { _all: true },
    });
    for (const combo of combos) expect(combo._count._all).toBe(2);
    expect(DepositCoverage.ANTICIPO).toBeDefined();
  });

  describe('reglas de horario aplicadas en el backend', () => {
    const dateOf = (when: Date) =>
      new Date(`${getCalendarDayKey(when)}T00:00:00.000Z`);

    it('un día bloqueado para todo el spa no admite reservas y no deja filas', async () => {
      const when = futureSlot(50, 10);
      await prisma.client.scheduleException.create({
        data: { date: dateOf(when), type: 'BLOCK', reason: 'Festivo' },
      });
      const before = await prisma.client.reservation.count();
      await expect(book(world.secondary.treatmentId, when)).rejects.toThrow();
      expect(await prisma.client.reservation.count()).toBe(before);
    });

    it('un bloqueo solo de una categoría no afecta a otra categoría el mismo día', async () => {
      const when = futureSlot(51, 10);
      await prisma.client.scheduleException.create({
        data: {
          date: dateOf(when),
          type: 'BLOCK',
          categoryId: world.secondary.categoryId,
        },
      });
      await expect(book(world.secondary.treatmentId, when)).rejects.toThrow();
      const ok = await book(world.tertiary.treatmentId, when);
      expect(ok.reservations).toHaveLength(1);
    });

    it('un bloqueo parcial (12:00–14:00) nunca deja una reserva que lo cruce', async () => {
      const when = futureSlot(52, 12);
      await prisma.client.scheduleException.create({
        data: {
          date: dateOf(when),
          type: 'BLOCK',
          startMinute: 12 * 60,
          endMinute: 14 * 60,
        },
      });
      const result = await book(world.secondary.treatmentId, when).then(
        (r) => r,
        () => null,
      );
      if (result) {
        const r = result.reservations[0];
        const startMin =
          r.scheduledStart.getHours() * 60 + r.scheduledStart.getMinutes();
        const endMin =
          r.scheduledEnd.getHours() * 60 + r.scheduledEnd.getMinutes();
        expect(startMin >= 14 * 60 || endMin <= 12 * 60).toBe(true);
      }
    });

    it('una reserva que terminaría después del cierre se reubica o se rechaza, nunca queda fuera del horario', async () => {
      const result = await book(
        world.secondary.treatmentId,
        futureSlot(53, 17, 30),
      ).then(
        (r) => r,
        () => null,
      );
      if (result) {
        const r = result.reservations[0];
        expect(
          r.scheduledEnd.getHours() * 60 + r.scheduledEnd.getMinutes(),
        ).toBeLessThanOrEqual(18 * 60);
      }
    });

    it('una categoría sin cupo configurado (capacidad 0) rechaza cualquier reserva', async () => {
      await prisma.client.capacityPool.updateMany({
        where: { categoryId: world.tertiary.categoryId },
        data: { isActive: false },
      });
      await expect(
        book(world.tertiary.treatmentId, futureSlot(54, 10)),
      ).rejects.toThrow();
      await prisma.client.capacityPool.updateMany({
        where: { categoryId: world.tertiary.categoryId },
        data: { isActive: true },
      });
    });
  });
});
