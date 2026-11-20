import { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DepositStatus, DepositVerificationMethod } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { OperationalNotificationsService } from 'src/automation/operational-notifications.service';
import { LeadFollowUpService } from 'src/automation/lead-follow-up.service';
import { AutomationExecutionRepository } from 'src/automation/repositories/automation-execution.repository';
import { AdminNotificationRecipientsRepository } from 'src/admin-notifications/repository/admin-notification-recipients.repository';
import type {
  ConduitApiClient,
  SendResult,
} from 'src/conduit/client/conduit-api.client';
import type { ConduitTemplateResolver } from 'src/conduit/templates/conduit-template-resolver';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
import type { ClientDepositReminderJobData } from 'src/automation/domain/operational-notifications.constants';
import {
  createHarnessModule,
  fakeQueues,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

const ctx = { idempotencyKey: 'job-1', companyEventId: 'evt-1' };
const templates = {
  resolve: () => Promise.resolve('tpl-1'),
} as unknown as ConduitTemplateResolver;

describe('Mensajes automáticos de seguimiento', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let create: CreateReservationOrchestrator;
  const whatsapp = jest.fn<Promise<SendResult>, [Record<string, unknown>]>();
  let muted: Array<{ address: string }> = [];

  const conduit = {
    sendWhatsappMessage: whatsapp,
    admin: () => Promise.resolve(muted),
  } as unknown as ConduitApiClient;

  const notifications = () =>
    new OperationalNotificationsService(
      moduleRef.get(ConfigService),
      conduit,
      moduleRef.get(ReservationsRepository),
      new AdminNotificationRecipientsRepository(prisma),
      new AutomationExecutionRepository(prisma),
      templates,
      prisma,
    );

  const leads = () =>
    new LeadFollowUpService(
      prisma,
      conduit,
      templates,
      new AutomationExecutionRepository(prisma),
      { get: () => 'bot-1' } as unknown as ConfigService,
    );

  const settings = (data: {
    depositReminderEnabled?: boolean;
    leadFollowUpEnabled?: boolean;
  }) =>
    prisma.client.businessSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    create = moduleRef.get(CreateReservationOrchestrator);
  });

  afterAll(async () => {
    await settings({
      depositReminderEnabled: true,
      leadFollowUpEnabled: false,
    });
    await moduleRef.close();
  });

  beforeEach(() => {
    whatsapp.mockReset();
    whatsapp.mockResolvedValue({ delivered: true, messageId: 'm1' });
    muted = [];
    for (const queue of Object.values(fakeQueues)) queue.jobs.length = 0;
  });

  const reminderJobs = () =>
    fakeQueues.communications.jobs
      .filter((j) => j.name === JOB_NAMES.SEND_CLIENT_DEPOSIT_REMINDER)
      .map((j) => j.data as ClientDepositReminderJobData);

  describe('recordatorio del anticipo', () => {
    beforeAll(() => settings({ depositReminderEnabled: true }));

    it('al apartar la cita se programa un recordatorio 30 minutos antes de que venza el plazo', async () => {
      const { reservations } = await create.execute({
        client: newClientDto('recordatorio'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(6, 10).toISOString(),
      });
      const [job] = fakeQueues.communications.jobs.filter(
        (j) => j.name === JOB_NAMES.SEND_CLIENT_DEPOSIT_REMINDER,
      );
      expect(job).toBeDefined();
      const expiresAt = reservations[0].depositExpiresAt!;
      expect((job.data as ClientDepositReminderJobData).expiresAt).toBe(
        expiresAt.toISOString(),
      );
      const delay = job.opts?.delay as number;
      expect(Date.now() + delay).toBeGreaterThan(
        expiresAt.getTime() - 31 * 60_000,
      );
      expect(Date.now() + delay).toBeLessThan(
        expiresAt.getTime() - 29 * 60_000,
      );

      await notifications().notifyClientDepositReminder(reminderJobs()[0], ctx);
      expect(whatsapp).toHaveBeenCalledTimes(1);
      expect(whatsapp.mock.calls[0][0]).toMatchObject({
        templateId: 'tpl-1',
        variables: expect.objectContaining({ nombre: 'Audit' }) as unknown,
      });
    });

    it('en un combo le llega un solo recordatorio', async () => {
      await create.execute({
        client: newClientDto('combo'),
        treatments: [
          world.principal.simpleTreatmentId,
          world.tertiary.treatmentId,
        ],
        scheduledStart: futureSlot(6, 13).toISOString(),
      });
      const jobs = reminderJobs();
      expect(jobs).toHaveLength(2);
      for (const job of jobs) {
        await notifications().notifyClientDepositReminder(job, ctx);
      }
      expect(whatsapp).toHaveBeenCalledTimes(1);
    });

    it('no se envía si ya mandó el comprobante, si el plazo cambió o si está apagado', async () => {
      const { reservations } = await create.execute({
        client: newClientDto('comprobante'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(6, 15).toISOString(),
      });
      const [job] = reminderJobs();

      await notifications().notifyClientDepositReminder(
        { ...job, expiresAt: new Date(0).toISOString() },
        ctx,
      );

      await settings({ depositReminderEnabled: false });
      await notifications().notifyClientDepositReminder(job, ctx);
      await settings({ depositReminderEnabled: true });

      await prisma.client.depositRecord.create({
        data: {
          reservationId: reservations[0].id,
          status: DepositStatus.PENDIENTE,
          method: DepositVerificationMethod.MANUAL,
          imageUrl: 'https://img/comprobante.jpg',
        },
      });
      await notifications().notifyClientDepositReminder(job, ctx);

      expect(whatsapp).not.toHaveBeenCalled();
    });
  });

  describe('seguimiento a quien dejó sus datos y no agendó', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
    const lead = async (label: string, createdAt: Date) => {
      const dto = newClientDto(label);
      return prisma.client.client.create({
        data: { phone: dto.phone, name: dto.name, createdAt },
      });
    };

    it('apagado por defecto no le escribe a nadie', async () => {
      await settings({ leadFollowUpEnabled: false });
      await lead('apagado', hoursAgo(24));
      expect(await leads().sweep(ctx)).toEqual({ sent: 0, skipped: 0 });
      expect(whatsapp).not.toHaveBeenCalled();
    });

    it('activo, le escribe una sola vez a quien se registró ayer y no agendó', async () => {
      await prisma.client.client.updateMany({
        data: { leadFollowUpSentAt: new Date() },
      });
      await settings({ leadFollowUpEnabled: true });
      const target = await lead('interesada', hoursAgo(26));
      await lead('muy-reciente', hoursAgo(2));
      await lead('hace-una-semana', hoursAgo(24 * 7));
      const silenced = await lead('silenciada', hoursAgo(30));
      muted = [{ address: silenced.phone.replace(/\D/g, '') }];
      const booked = newClientDto('con-cita');
      await create.execute({
        client: booked,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(8, 10).toISOString(),
      });
      await prisma.client.client.update({
        where: { phone: booked.phone },
        data: { createdAt: hoursAgo(28) },
      });

      expect(await leads().sweep(ctx)).toEqual({ sent: 1, skipped: 1 });
      expect(whatsapp).toHaveBeenCalledTimes(1);
      expect(whatsapp.mock.calls[0][0]).toMatchObject({ phone: target.phone });

      expect(await leads().sweep(ctx)).toEqual({ sent: 0, skipped: 0 });
      expect(whatsapp).toHaveBeenCalledTimes(1);
    });

    it('si no puede leer los números silenciados no envía nada', async () => {
      await settings({ leadFollowUpEnabled: true });
      await lead('sin-lista', hoursAgo(25));
      const failing = new LeadFollowUpService(
        prisma,
        {
          sendWhatsappMessage: whatsapp,
          admin: () => Promise.reject(new Error('Conduit caído')),
        } as unknown as ConduitApiClient,
        templates,
        new AutomationExecutionRepository(prisma),
        { get: () => 'bot-1' } as unknown as ConfigService,
      );
      expect(await failing.sweep(ctx)).toEqual({ sent: 0, skipped: 0 });
      expect(whatsapp).not.toHaveBeenCalled();
    });
  });
});
