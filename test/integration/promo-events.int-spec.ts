import { TestingModule } from '@nestjs/testing';
import {
  ReservationChannel,
  ReservationStatus,
  type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { PromoEventTicketsService } from 'src/promo-events/promo-event-tickets.service';
import { PromoEventsService } from 'src/promo-events/promo-events.service';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
import {
  createHarnessModule,
  newClientDto,
  resetDatabase,
  seedWorld,
  type World,
} from './harness';

const DAY = 86_400_000;

describe('eventos: boletas y sorteo', () => {
  let moduleRef: TestingModule;
  let prismaService: PrismaService;
  let prisma: PrismaClient;
  let world: World;
  const queue = {
    add: jest.fn<Promise<void>, [string, unknown, unknown]>(),
  };
  const eventBus = { publish: jest.fn() };
  let tickets: PromoEventTicketsService;
  let events: PromoEventsService;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prismaService = moduleRef.get(PrismaService);
    prisma = prismaService.client;
    tickets = new PromoEventTicketsService(prismaService, queue as never);
    events = new PromoEventsService(
      prismaService,
      eventBus as never,
      queue as never,
    );
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "event_tickets", "promo_events" CASCADE',
    );
    world = await seedWorld(prisma);
    queue.add.mockReset().mockResolvedValue(undefined);
  });

  afterAll(() => moduleRef.close());

  async function newClient() {
    const dto = newClientDto('evento');
    return prisma.client.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
      },
    });
  }

  function completed(
    clientId: string,
    completedAt: Date,
    comboGroupId: string | null = null,
  ) {
    return prisma.reservation.create({
      data: {
        clientId,
        categoryId: world.principal.categoryId,
        treatmentId: world.principal.treatmentId,
        status: ReservationStatus.COMPLETADA,
        channel: ReservationChannel.WHATSAPP,
        scheduledStart: completedAt,
        scheduledEnd: new Date(completedAt.getTime() + 3_600_000),
        finalPrice: 100,
        finalDurationMinutes: 60,
        completedAt,
        comboGroupId,
      },
    });
  }

  function rifa(overrides: Record<string, unknown> = {}) {
    return prisma.promoEvent.create({
      data: {
        name: 'Rifa de aniversario',
        description: 'Por cada visita recibes una boleta.',
        startsAt: new Date(Date.now() - 5 * DAY),
        endsAt: new Date(Date.now() + 5 * DAY),
        ticketsEnabled: true,
        ...overrides,
      },
    });
  }

  it('cada visita completada recibe una boleta con número consecutivo y se le avisa', async () => {
    const event = await rifa();
    const a = await newClient();
    const b = await newClient();
    const r1 = await completed(a.id, new Date());
    const r2 = await completed(b.id, new Date());

    await expect(tickets.issueForCompletedReservation(r1.id)).resolves.toEqual([
      1,
    ]);
    await expect(tickets.issueForCompletedReservation(r2.id)).resolves.toEqual([
      2,
    ]);
    await expect(tickets.issueForCompletedReservation(r1.id)).resolves.toEqual(
      [],
    );

    const rows = await prisma.eventTicket.findMany({
      where: { eventId: event.id },
      orderBy: { number: 'asc' },
    });
    expect(rows.map((t) => [t.number, t.clientId])).toEqual([
      [1, a.id],
      [2, b.id],
    ]);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      JOB_NAMES.NOTIFY_CLIENT_EVENT_TICKET,
      expect.objectContaining({ ticketId: rows[0].id }),
      expect.anything(),
    );
  });

  it('un combo de varios servicios en la misma visita da una sola boleta', async () => {
    await rifa();
    const client = await newClient();
    const combo = randomUUID();
    const first = await completed(client.id, new Date(), combo);
    const second = await completed(client.id, new Date(), combo);

    await tickets.issueForCompletedReservation(first.id);
    await tickets.issueForCompletedReservation(second.id);

    expect(await prisma.eventTicket.count()).toBe(1);
  });

  it('no da boletas fuera de las fechas, con el evento inactivo o sin boletas', async () => {
    await rifa({ startsAt: new Date(Date.now() + DAY) });
    await rifa({ isActive: false });
    await rifa({ ticketsEnabled: false });
    const client = await newClient();
    const visit = await completed(client.id, new Date());

    await expect(
      tickets.issueForCompletedReservation(visit.id),
    ).resolves.toEqual([]);
  });

  it('boletas simultáneas no repiten número', async () => {
    const event = await rifa();
    const visits = await Promise.all(
      Array.from({ length: 8 }, async () =>
        completed((await newClient()).id, new Date()),
      ),
    );

    await Promise.all(
      visits.map((v) => tickets.issueForCompletedReservation(v.id)),
    );

    const numbers = (
      await prisma.eventTicket.findMany({ where: { eventId: event.id } })
    )
      .map((t) => t.number)
      .sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('el sorteo elige ganadoras distintas y cada clienta gana una sola vez', async () => {
    const event = await rifa();
    const a = await newClient();
    const b = await newClient();
    for (const reservation of [
      await completed(a.id, new Date()),
      await completed(a.id, new Date(Date.now() - DAY)),
      await completed(b.id, new Date()),
    ]) {
      await tickets.issueForCompletedReservation(reservation.id);
    }

    const first = await events.draw(
      event.id,
      'Kit de productos',
      world.admin.id,
    );
    const second = await events.draw(
      event.id,
      'Ritual completo',
      world.admin.id,
    );

    expect(new Set([first.client.id, second.client.id]).size).toBe(2);
    await expect(
      events.draw(event.id, 'Otro premio', world.admin.id),
    ).rejects.toThrow('cada clienta puede ganar una sola vez');

    const winners = await prisma.eventTicket.findMany({
      where: { eventId: event.id, wonAt: { not: null } },
    });
    expect(winners).toHaveLength(2);
    expect(winners.every((w) => w.drawnByUserId === world.admin.id)).toBe(true);
    expect(
      queue.add.mock.calls.filter(
        ([name]) => name === JOB_NAMES.NOTIFY_CLIENT_EVENT_WINNER,
      ),
    ).toHaveLength(2);
  });

  it('no deja borrar un evento con boletas', async () => {
    const event = await rifa();
    const visit = await completed((await newClient()).id, new Date());
    await tickets.issueForCompletedReservation(visit.id);

    await expect(events.remove(event.id)).rejects.toThrow('desactívalo');
  });

  it('al editar con premios vacíos se borran y el bot se resincroniza', async () => {
    const event = await rifa({ prizes: 'Kit de productos' });
    eventBus.publish.mockClear();

    const updated = await events.update(event.id, { prizes: '' });

    expect(updated.prizes).toBeNull();
    expect(eventBus.publish).toHaveBeenCalledWith('business.info_changed', {
      source: 'events',
    });
  });
});
