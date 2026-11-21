import { TestingModule } from '@nestjs/testing';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { addHairServices } from '../../prisma/add-hair-services';
import { HAIR_SERVICES } from '../../prisma/seed-data/hair-services';
import {
  createHarnessModule,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
} from './harness';

describe('Corte, cepillado y tinte en el catálogo', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const categorySlug = 'secundaria';
  const quiet = { categorySlug, log: () => undefined };

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    await seedWorld(prisma.client);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const created = () =>
    prisma.client.treatment.findMany({
      where: { slug: { in: HAIR_SERVICES.map((s) => s.slug) } },
      include: { steps: true },
    });

  it('la simulación no crea nada', async () => {
    const outcome = await addHairServices(prisma.client, {
      ...quiet,
      apply: false,
    });
    expect(outcome.created).toHaveLength(3);
    expect(await created()).toHaveLength(0);
  });

  it('crea los tres servicios con su contenido y sus pasos', async () => {
    const outcome = await addHairServices(prisma.client, {
      ...quiet,
      apply: true,
    });
    expect(outcome.created).toEqual(['Corte de cabello', 'Cepillado', 'Tinte']);
    const rows = await created();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.isActive).toBe(true);
      expect(row.requiresPriorAssessment).toBe(false);
      expect(row.hasHairVariablePricing).toBe(false);
      expect(row.summary).toBeTruthy();
      expect(row.steps.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('al repetirlo no duplica ni pisa lo que el equipo editó en el panel', async () => {
    await prisma.client.treatment.updateMany({
      where: { slug: 'corte-de-cabello' },
      data: { basePriceMin: 50, basePriceMax: 50 },
    });
    const outcome = await addHairServices(prisma.client, {
      ...quiet,
      apply: true,
    });
    expect(outcome.created).toEqual([]);
    expect(outcome.existing).toHaveLength(3);
    const corte = await prisma.client.treatment.findFirstOrThrow({
      where: { slug: 'corte-de-cabello' },
    });
    expect(Number(corte.basePriceMin)).toBe(50);
  });

  it('una clienta nueva puede agendar un corte sin valoración', async () => {
    const corte = await prisma.client.treatment.findFirstOrThrow({
      where: { slug: 'corte-de-cabello' },
    });
    const { reservations } = await moduleRef
      .get(CreateReservationOrchestrator)
      .execute({
        client: newClientDto('corte'),
        treatments: [corte.id],
        scheduledStart: futureSlot(3, 11).toISOString(),
      });
    expect(reservations[0].status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
    expect(Number(reservations[0].finalPrice)).toBe(50);
  });
});
