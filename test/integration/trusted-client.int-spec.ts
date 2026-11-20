import { TestingModule } from '@nestjs/testing';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { ClientsService } from 'src/clients/clients.service';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
import {
  createHarnessModule,
  fakeQueues,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

describe('Clientas de confianza sin anticipo', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  let clients: ClientsService;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
    clients = moduleRef.get(ClientsService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function trustedClient(label: string) {
    const dto = newClientDto(label);
    const client = await clients.resolveOrCreateForBooking(dto, {
      trustedIdentity: true,
    });
    const view = await clients.setDepositExempt(client.id, true);
    expect(view.depositExempt).toBe(true);
    return dto;
  }

  it('desde el panel o un WhatsApp verificado su cita queda confirmada sin plazo de anticipo', async () => {
    const dto = await trustedClient('confianza');
    for (const queue of Object.values(fakeQueues)) queue.jobs.length = 0;

    const { reservations } = await create.execute(
      {
        client: dto,
        treatments: [
          world.principal.simpleTreatmentId,
          world.tertiary.treatmentId,
        ],
        scheduledStart: futureSlot(4, 10).toISOString(),
      },
      { trustedIdentity: true },
    );

    for (const reservation of reservations) {
      expect(reservation.status).toBe(ReservationStatus.CONFIRMADA);
      expect(reservation.depositExpiresAt).toBeNull();
      expect(reservation.depositClockStartedAt).toBeNull();
    }
    const timeoutJobs = fakeQueues.timeouts.jobs.map((j) => j.name);
    expect(timeoutJobs).not.toContain(JOB_NAMES.DEPOSITO_TIMEOUT);
    expect(timeoutJobs).toContain(JOB_NAMES.NO_SHOW_CHECK);
    expect(fakeQueues.communications.jobs.map((j) => j.name)).not.toContain(
      JOB_NAMES.NOTIFY_CLIENT_RESERVATION_CONFIRMED,
    );
  });

  it('si el número llega por la web sin verificar, sigue debiendo el anticipo', async () => {
    const dto = await trustedClient('web');
    const { reservations } = await create.execute({
      client: dto,
      treatments: [world.secondary.treatmentId],
      scheduledStart: futureSlot(4, 14).toISOString(),
    });
    expect(reservations[0].status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
    expect(reservations[0].depositExpiresAt).not.toBeNull();
  });

  it('una clienta normal sigue con anticipo aunque venga del panel', async () => {
    const { reservations } = await create.execute(
      {
        client: newClientDto('normal'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(4, 15).toISOString(),
      },
      { trustedIdentity: true },
    );
    expect(reservations[0].status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
  });
});
