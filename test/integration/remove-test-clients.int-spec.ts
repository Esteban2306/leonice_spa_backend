import { TestingModule } from '@nestjs/testing';
import { DepositStatus, DepositVerificationMethod } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { removeTestClients } from '../../prisma/remove-test-clients';
import {
  createHarnessModule,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

describe('Borrar clientas de prueba', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function clientWithBooking(label: string, hour: number) {
    const dto = newClientDto(label);
    const { reservations } = await moduleRef
      .get(CreateReservationOrchestrator)
      .execute({
        client: dto,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(5, hour).toISOString(),
      });
    await prisma.client.depositRecord.create({
      data: {
        reservationId: reservations[0].id,
        status: DepositStatus.PENDIENTE,
        method: DepositVerificationMethod.MANUAL,
        imageUrl: 'https://img/comprobante.jpg',
      },
    });
    return dto.phone;
  }

  it('la simulación cuenta todo y no borra nada; con --apply borra solo a las elegidas', async () => {
    const test = await clientWithBooking('prueba', 10);
    const real = await clientWithBooking('real', 12);

    const preview = await removeTestClients(prisma.client, {
      phones: [test],
      apply: false,
    });
    expect(preview.clients).toHaveLength(1);
    expect(preview.counts.reservas).toBe(1);
    expect(preview.counts.anticipos).toBe(1);
    expect(await prisma.client.client.count({ where: { phone: test } })).toBe(
      1,
    );

    await removeTestClients(prisma.client, { phones: [test], apply: true });
    expect(await prisma.client.client.count({ where: { phone: test } })).toBe(
      0,
    );
    const kept = await prisma.client.client.findUniqueOrThrow({
      where: { phone: real },
      include: { reservations: true },
    });
    expect(kept.reservations).toHaveLength(1);
  });

  it('un teléfono que no coincide con exactamente una clienta no borra nada', async () => {
    const before = await prisma.client.client.count();
    await expect(
      removeTestClients(prisma.client, {
        phones: ['3000000000'],
        apply: true,
      }),
    ).rejects.toThrow('coincide con 0 clientas');
    expect(await prisma.client.client.count()).toBe(before);
  });
});
