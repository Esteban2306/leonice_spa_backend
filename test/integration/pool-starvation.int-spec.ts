import { TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
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

const CONFIGURED_POOL = 5;

describe('2b. Ráfaga de reservas con el pool de conexiones configurado en .env', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL as string);
    url.searchParams.set('connection_limit', String(CONFIGURED_POOL));
    process.env.DATABASE_URL = url.toString();
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it.each([CONFIGURED_POOL + 1, CONFIGURED_POOL * 3, CONFIGURED_POOL * 6])(
    '%i reservas simultáneas de la misma categoría y día se resuelven sin errores de infraestructura ni bloqueos largos',
    async (burst) => {
      const create = moduleRef.get(CreateReservationOrchestrator);
      const start = futureSlot(3 + burst, 10);
      const startedAt = Date.now();
      const { ok, failedCodes } = await settle(
        Array.from({ length: burst }, () =>
          create.execute({
            client: newClientDto('rafaga'),
            treatments: [world.lowCap.treatmentId],
            scheduledStart: start.toISOString(),
          }),
        ),
      );
      const elapsed = Date.now() - startedAt;

      const infra = failedCodes.filter(
        (c) => c !== 'PLACEMENT_NO_SLOT_THAT_DAY',
      );
      expect(infra).toEqual([]);
      expect(ok.length).toBe(Math.min(burst, 10));
      expect(elapsed).toBeLessThan(5000);
      expect(await maxConcurrency(prisma.client, world.lowCap.categoryId)).toBe(
        1,
      );
    },
  );
});
