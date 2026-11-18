import { TestingModule } from '@nestjs/testing';
import {
  AutomationExecutionType,
  ReservationChannel,
  ReservationStatus,
  type PrismaClient,
} from '@prisma/client';
import type { Job } from 'bullmq';
import { EventBusService } from 'src/common/events/event.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
import { ReservationTimeoutsProcessor } from 'src/automation/processors/reservation-timeouts.processor';
import { AutomationExecutionRepository } from 'src/automation/repositories/automation-execution.repository';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { AdminCancelReservationOrchestrator } from 'src/reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from 'src/reservations/orchestrators/mark-no-show.orchestrator';
import {
  createHarnessModule,
  newClientDto,
  resetDatabase,
  seedWorld,
  type World,
} from './harness';

const DAY = 86_400_000;
const sweep = { name: JOB_NAMES.NO_SHOW_SWEEP, data: {} } as unknown as Job;

describe('barrido de inasistencias contra la base', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let world: World;
  let processor: ReservationTimeoutsProcessor;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    const prismaService = moduleRef.get(PrismaService);
    prisma = prismaService.client;
    processor = new ReservationTimeoutsProcessor(
      moduleRef.get(ReservationsRepository),
      moduleRef.get(AdminCancelReservationOrchestrator),
      moduleRef.get(MarkNoShowOrchestrator),
      new AutomationExecutionRepository(prismaService),
      moduleRef.get(EventBusService),
    );
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    world = await seedWorld(prisma);
  });

  afterAll(() => moduleRef.close());

  async function booking(status: ReservationStatus, start: Date) {
    const dto = newClientDto('barrido');
    const client = await prisma.client.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
      },
    });
    return prisma.reservation.create({
      data: {
        clientId: client.id,
        categoryId: world.principal.categoryId,
        treatmentId: world.principal.treatmentId,
        status,
        channel: ReservationChannel.WHATSAPP,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 3_600_000),
        finalPrice: 100,
        finalDurationMinutes: 60,
      },
    });
  }

  it('marca como no asistió las vencidas de cualquier estado pendiente, también las antiguas, y deja el registro', async () => {
    const old = new Date(Date.now() - 40 * DAY);
    const yesterday = new Date(Date.now() - DAY);
    const valoracion = await booking(
      ReservationStatus.PENDIENTE_VALORACION,
      old,
    );
    const deposito = await booking(
      ReservationStatus.PENDIENTE_DEPOSITO,
      yesterday,
    );
    const confirmada = await booking(ReservationStatus.CONFIRMADA, yesterday);
    const futura = await booking(
      ReservationStatus.PENDIENTE_VALORACION,
      new Date(Date.now() + DAY),
    );
    const enGracia = await booking(
      ReservationStatus.CONFIRMADA,
      new Date(Date.now() - 5 * 60_000),
    );

    await processor.process(sweep);

    const byId = new Map(
      (await prisma.reservation.findMany()).map((r) => [r.id, r]),
    );
    expect(byId.get(valoracion.id)).toMatchObject({
      status: ReservationStatus.NO_SHOW,
      noShowFromStatus: ReservationStatus.PENDIENTE_VALORACION,
    });
    expect(byId.get(deposito.id)).toMatchObject({
      status: ReservationStatus.NO_SHOW,
      noShowFromStatus: ReservationStatus.PENDIENTE_DEPOSITO,
    });
    expect(byId.get(confirmada.id)).toMatchObject({
      status: ReservationStatus.NO_SHOW,
      noShowFromStatus: ReservationStatus.CONFIRMADA,
    });
    expect(byId.get(futura.id)?.status).toBe(
      ReservationStatus.PENDIENTE_VALORACION,
    );
    expect(byId.get(enGracia.id)?.status).toBe(ReservationStatus.CONFIRMADA);

    const logs = await prisma.automationExecution.findMany({
      where: { type: AutomationExecutionType.NO_SHOW_CHECK },
    });
    expect(logs).toHaveLength(3);
    expect(
      logs.find((l) => l.reservationId === valoracion.id)?.reason,
    ).toContain('estaba en PENDIENTE_VALORACION');
  });
});
