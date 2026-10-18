import { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { OperationalNotificationsService } from 'src/automation/operational-notifications.service';
import { AdminNotificationRecipientsRepository } from 'src/admin-notifications/repository/admin-notification-recipients.repository';
import { AdminNotificationRecipientsService } from 'src/admin-notifications/admin-notification-recipients.service';
import { AutomationExecutionRepository } from 'src/automation/repositories/automation-execution.repository';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import type {
  ConduitApiClient,
  SendResult,
} from 'src/conduit/client/conduit-api.client';
import type { ConduitTemplateResolver } from 'src/conduit/templates/conduit-template-resolver';
import { createHarnessModule, resetDatabase } from './harness';

describe('Avisos al equipo por correo (vía Conduit)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let recipients: AdminNotificationRecipientsService;
  const whatsapp = jest.fn<Promise<SendResult>, [Record<string, unknown>]>();
  const email = jest.fn<Promise<SendResult>, [Record<string, unknown>]>();
  let templateIds: Record<string, string | null>;

  const build = () =>
    new OperationalNotificationsService(
      moduleRef.get(ConfigService),
      {
        sendWhatsappMessage: whatsapp,
        sendEmailMessage: email,
      } as unknown as ConduitApiClient,
      moduleRef.get(ReservationsRepository),
      new AdminNotificationRecipientsRepository(prisma),
      new AutomationExecutionRepository(prisma),
      {
        resolve: (envKey: string) =>
          Promise.resolve(templateIds[envKey] ?? null),
      } as unknown as ConduitTemplateResolver,
    );

  const handoff = (recipientId: string, idempotencyKey = 'job-1') =>
    build().notifyAdminHandoff(
      {
        recipientId,
        phone: '+573001112233',
        lid: null,
        clientName: 'Clienta <b>prueba</b>',
        reason: 'Quiere hablar con alguien',
        summary: null,
      },
      { idempotencyKey, companyEventId: 'evento-1' },
    );

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    await prisma.client.adminNotificationRecipient.deleteMany({});
    recipients = new AdminNotificationRecipientsService(
      new AdminNotificationRecipientsRepository(prisma),
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(() => {
    whatsapp.mockReset().mockResolvedValue({ delivered: true });
    email.mockReset().mockResolvedValue({ delivered: true });
    templateIds = {
      CONDUIT_TEMPLATE_ADMIN_HANDOFF: 'tpl-whatsapp',
      CONDUIT_TEMPLATE_ADMIN_HANDOFF_EMAIL: 'tpl-correo',
    };
  });

  let seq = 0;
  const recipient = (mail: string | null) =>
    recipients.create({
      name: 'Equipo',
      phone: `30000000${String(++seq).padStart(2, '0')}`,
      ...(mail ? { email: mail } : {}),
    });

  it('con correo configurado el aviso sale por WhatsApp y por correo con claves de idempotencia distintas', async () => {
    const r = await recipient('Equipo@Leonice.Test');
    expect(r.email).toBe('equipo@leonice.test');

    await handoff(r.id);

    expect(whatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'tpl-whatsapp',
        idempotencyKey: 'job-1:ADMIN_HANDOFF',
      }),
    );
    expect(email).toHaveBeenCalledWith({
      email: 'equipo@leonice.test',
      templateId: 'tpl-correo',
      variables: whatsapp.mock.calls[0][0].variables,
      idempotencyKey: 'job-1:ADMIN_HANDOFF:EMAIL',
      companyEventId: 'evento-1',
    });
  });

  it('sin correo configurado solo sale el WhatsApp', async () => {
    const r = await recipient(null);
    await handoff(r.id);
    expect(whatsapp).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
  });

  it('si falta la plantilla de correo el aviso de WhatsApp no se pierde', async () => {
    templateIds.CONDUIT_TEMPLATE_ADMIN_HANDOFF_EMAIL = null;
    const r = await recipient('equipo2@leonice.test');
    await expect(handoff(r.id)).resolves.toBeUndefined();
    expect(whatsapp).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
  });

  it('un rechazo permanente del correo no hace fallar el aviso', async () => {
    email.mockResolvedValue({
      delivered: false,
      permanent: true,
      reason: 'dirección inválida',
    });
    const r = await recipient('equipo3@leonice.test');
    await expect(handoff(r.id)).resolves.toBeUndefined();
    expect(whatsapp).toHaveBeenCalledTimes(1);
  });

  it('un fallo transitorio del correo reintenta el job sin duplicar el WhatsApp (misma clave)', async () => {
    email.mockResolvedValueOnce({ delivered: false, reason: 'timeout' });
    const r = await recipient('equipo4@leonice.test');

    await expect(handoff(r.id, 'job-reintento')).rejects.toThrow();
    await handoff(r.id, 'job-reintento');

    const whatsappKeys = whatsapp.mock.calls.map((c) => c[0].idempotencyKey);
    const emailKeys = email.mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(whatsappKeys)).toEqual(
      new Set(['job-reintento:ADMIN_HANDOFF']),
    );
    expect(new Set(emailKeys)).toEqual(
      new Set(['job-reintento:ADMIN_HANDOFF:EMAIL']),
    );
  });

  it('se puede quitar el correo de un destinatario', async () => {
    const r = await recipient('equipo5@leonice.test');
    const updated = await recipients.update(r.id, { email: null });
    expect(updated.email).toBeNull();
  });

  it('la base rechaza correos sin normalizar escritos por fuera del servicio', async () => {
    await expect(
      prisma.client.adminNotificationRecipient.create({
        data: {
          name: 'x',
          phone: '+579999999999',
          email: 'Mayus@Leonice.Test',
        },
      }),
    ).rejects.toThrow();
  });
});
