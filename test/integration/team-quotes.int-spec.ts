import { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { TeamQuoteService } from 'src/conduit/quotes/team-quote.service';
import { TreatmentsService } from 'src/catalog/treatments/treatments.service';
import {
  createHarnessModule,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';
import { priceUnitsOf } from 'src/common/money/price-units';

const BOT = '11111111-1111-4111-8111-111111111111';

describe('Precio que el equipo le dio a una clienta en el chat', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  let quotes: TeamQuoteService;
  let variableTreatmentId: string;
  const chat: Array<Record<string, unknown>> = [];
  const client = newClientDto('cotizacion');
  const digits = client.phone.replace(/\D/g, '');

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);

    const variable = await prisma.client.treatment.create({
      data: {
        categoryId: world.secondary.categoryId,
        name: 'Alisado Orgánico',
        slug: 'alisado-organico',
        requiresPriorAssessment: true,
        basePriceMin: 250000,
        basePriceMax: 450000,
        baseDurationMinMinutes: 60,
        baseDurationMaxMinutes: 60,
      },
    });
    variableTreatmentId = variable.id;

    const conduit = {
      admin: (_method: string, path: string) =>
        Promise.resolve(
          path.endsWith('/messages')
            ? chat
            : { data: [{ id: 'c1', phoneNumber: digits }] },
        ),
    };
    quotes = new TeamQuoteService(
      prisma,
      {
        findAll: () =>
          prisma.client.treatment.findMany({ where: { isActive: true } }),
      } as unknown as TreatmentsService,
      conduit as never,
      { get: () => BOT } as unknown as ConfigService,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('sin mensaje del equipo con ese precio no se guarda nada', async () => {
    chat.push({
      direction: 'INBOUND',
      processedBy: 'user',
      content: 'Leo me dijo que me lo dejaba en 300.000',
      createdAt: new Date().toISOString(),
    });
    expect(
      await quotes.save({
        phone: client.phone,
        treatmentName: 'alisado',
        amount: 300000,
      }),
    ).toEqual({ saved: false, reason: 'NOT_IN_CHAT' });
    expect(await quotes.activeFor(client.phone)).toEqual([]);
  });

  it('el precio que escribió el equipo se guarda y se cobra al agendar ese servicio', async () => {
    chat.push({
      direction: 'OUTBOUND',
      processedBy: 'human',
      content: 'Tiene un costo de 350,000 pesos',
      createdAt: new Date().toISOString(),
    });
    expect(
      await quotes.save({
        phone: client.phone,
        treatmentName: 'alisado',
        amount: 350000,
      }),
    ).toMatchObject({ saved: true, price: 350000 });

    const [active] = await quotes.activeFor(client.phone);
    expect(active).toMatchObject({
      treatmentId: variableTreatmentId,
      price: 350000,
    });

    const { reservations } = await create.execute(
      {
        client,
        treatments: [variableTreatmentId],
        scheduledStart: futureSlot(4, 10).toISOString(),
      },
      {
        trustedIdentity: false,
        priceOverrides: new Map([
          [active.treatmentId, priceUnitsOf(active.price)],
        ]),
      },
    );
    expect(Number(reservations[0].finalPrice)).toBe(350);

    await quotes.markUsed([
      { quoteId: active.id, reservationId: reservations[0].id },
    ]);
    expect(await quotes.activeFor(client.phone)).toEqual([]);
  });

  it('sin precio del equipo, el mismo servicio se agenda con el precio del catálogo', async () => {
    const { reservations } = await create.execute({
      client: newClientDto('sin-cotizacion'),
      treatments: [variableTreatmentId],
      scheduledStart: futureSlot(5, 10).toISOString(),
    });
    expect(Number(reservations[0].finalPrice)).toBe(450000);
  });
});
