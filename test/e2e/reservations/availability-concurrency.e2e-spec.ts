import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AvailabilityRepository } from 'src/reservations/repositories/availability.repository';

describe('Availability concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let availabilityRepository: AvailabilityRepository;

  let categoryId: string;
  let treatmentId: string;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    availabilityRepository = app.get(AvailabilityRepository);

    const category = await prisma.client.category.create({
      data: { name: `Test Concurrency ${Date.now()}` },
    });
    categoryId = category.id;

    await prisma.client.capacityPool.create({
      data: { categoryId, name: 'Test pool', maxConcurrent: 1 },
    });

    const treatment = await prisma.client.treatment.create({
      data: {
        categoryId,
        name: 'Test treatment',
        basePriceMin: 100,
        basePriceMax: 100,
        baseDurationMinMinutes: 60,
        baseDurationMaxMinutes: 60,
      },
    });
    treatmentId = treatment.id;

    const clientA = await prisma.client.client.create({
      data: {
        phone: `+57${Date.now()}1`,
        name: 'Cliente A',
        birthDate: new Date('1990-01-01'),
      },
    });
    clientAId = clientA.id;

    const clientB = await prisma.client.client.create({
      data: {
        phone: `+57${Date.now()}2`,
        name: 'Cliente B',
        birthDate: new Date('1990-01-01'),
      },
    });
    clientBId = clientB.id;
  });
  afterAll(async () => {
    await prisma.client.reservation.deleteMany({ where: { categoryId } });
    await prisma.client.treatment.deleteMany({ where: { categoryId } });
    await prisma.client.capacityPool.deleteMany({ where: { categoryId } });
    await prisma.client.client.deleteMany({
      where: { id: { in: [clientAId, clientBId] } },
    });
    await prisma.client.category.delete({ where: { id: categoryId } });

    if (app) {
      await app.close();
    }
  });

  it('cuando dos solicitudes compiten por el mismo horario con capacidad 1, solo una prospera', async () => {
    const scheduledStart = new Date('2027-03-15T09:00:00');
    const scheduledEnd = new Date('2027-03-15T10:00:00');

    const [resultA, resultB] = await Promise.all([
      availabilityRepository.attemptToHoldSlot({
        categoryId,
        treatmentId,
        clientId: clientAId,
        scheduledStart,
        scheduledEnd,
        finalPrice: 100,
        finalDurationMinutes: 60,
      }),
      availabilityRepository.attemptToHoldSlot({
        categoryId,
        treatmentId,
        clientId: clientBId,
        scheduledStart,
        scheduledEnd,
        finalPrice: 100,
        finalDurationMinutes: 60,
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const reservationsInDb = await prisma.client.reservation.count({
      where: { categoryId, scheduledStart },
    });
    expect(reservationsInDb).toBe(1);
  });

  it('un horario que NO se solapa sí prospera, aunque la categoría esté ocupada en otro horario ese mismo día', async () => {
    const laterStart = new Date('2027-03-15T11:00:00');
    const laterEnd = new Date('2027-03-15T12:00:00');

    const result = await availabilityRepository.attemptToHoldSlot({
      categoryId,
      treatmentId,
      clientId: clientAId,
      scheduledStart: laterStart,
      scheduledEnd: laterEnd,
      finalPrice: 100,
      finalDurationMinutes: 60,
    });

    expect(result.success).toBe(true);
  });
});
