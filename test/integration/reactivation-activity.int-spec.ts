import { TestingModule } from '@nestjs/testing';
import {
  ReservationChannel,
  ReservationStatus,
  type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import {
  createHarnessModule,
  newClientDto,
  resetDatabase,
  seedWorld,
  type World,
} from './harness';

const HOUR = 3_600_000;

describe('recuperación: actividad más reciente de la clienta', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let repository: ReservationsRepository;
  let world: World;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService).client;
    repository = moduleRef.get(ReservationsRepository);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    world = await seedWorld(prisma);
  });

  afterAll(() => moduleRef.close());

  async function newClient() {
    const dto = newClientDto('recuperacion');
    return prisma.client.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
      },
    });
  }

  function reservation(
    clientId: string,
    categoryId: string,
    treatmentId: string,
    start: Date,
    status: ReservationStatus,
    extra: { completedAt?: Date; comboGroupId?: string } = {},
  ) {
    return prisma.reservation.create({
      data: {
        clientId,
        categoryId,
        treatmentId,
        status,
        channel: ReservationChannel.WHATSAPP,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + HOUR),
        finalPrice: 100,
        finalDurationMinutes: 60,
        ...extra,
      },
    });
  }

  it('una cita nueva en otra categoría cuenta como que volvió', async () => {
    const client = await newClient();
    const visit = new Date(Date.now() - 30 * 24 * HOUR);
    const done = await reservation(
      client.id,
      world.principal.categoryId,
      world.principal.treatmentId,
      visit,
      ReservationStatus.COMPLETADA,
      { completedAt: visit },
    );
    await reservation(
      client.id,
      world.secondary.categoryId,
      world.secondary.treatmentId,
      new Date(Date.now() + 2 * 24 * HOUR),
      ReservationStatus.PENDIENTE_DEPOSITO,
    );

    await expect(
      repository.hasMoreRecentActivity(client.id, visit, {
        reservationId: done.id,
        comboGroupId: null,
      }),
    ).resolves.toBe(true);
  });

  it('una cita cancelada o la propia visita no cuentan', async () => {
    const client = await newClient();
    const visit = new Date(Date.now() - 30 * 24 * HOUR);
    const done = await reservation(
      client.id,
      world.principal.categoryId,
      world.principal.treatmentId,
      visit,
      ReservationStatus.COMPLETADA,
      { completedAt: visit },
    );
    await reservation(
      client.id,
      world.secondary.categoryId,
      world.secondary.treatmentId,
      new Date(Date.now() + 2 * 24 * HOUR),
      ReservationStatus.CANCELADA,
    );

    await expect(
      repository.hasMoreRecentActivity(client.id, visit, {
        reservationId: done.id,
        comboGroupId: null,
      }),
    ).resolves.toBe(false);
  });

  it('los otros servicios del mismo combo no cuentan como una visita nueva', async () => {
    const client = await newClient();
    const comboGroupId = randomUUID();
    const visit = new Date(Date.now() - 30 * 24 * HOUR);
    const first = await reservation(
      client.id,
      world.principal.categoryId,
      world.principal.treatmentId,
      visit,
      ReservationStatus.COMPLETADA,
      { completedAt: visit, comboGroupId },
    );
    await reservation(
      client.id,
      world.secondary.categoryId,
      world.secondary.treatmentId,
      new Date(visit.getTime() + HOUR),
      ReservationStatus.COMPLETADA,
      { completedAt: new Date(visit.getTime() + 2 * HOUR), comboGroupId },
    );

    await expect(
      repository.hasMoreRecentActivity(client.id, visit, {
        reservationId: first.id,
        comboGroupId,
      }),
    ).resolves.toBe(false);
  });
});
