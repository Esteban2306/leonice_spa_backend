import { CONDUIT_TEMPLATE_CATALOG } from '../conduit/templates/conduit-template-catalog';
import { inProgressLine } from './domain/in-progress-line';
import { OperationalNotificationsService } from './operational-notifications.service';

const ctx = { idempotencyKey: 'k1', companyEventId: 'e1' };

function build() {
  const conduit = {
    sendWhatsappMessage: jest
      .fn()
      .mockResolvedValue({ delivered: true, messageId: 'm1' }),
  };
  const recipients = {
    findById: jest.fn().mockResolvedValue({
      id: 'a1',
      isActive: true,
      phone: '573001112233',
      email: null,
    }),
  };
  const executions = { log: jest.fn().mockResolvedValue(undefined) };
  const templates = { resolve: jest.fn().mockResolvedValue('tpl-1') };
  const service = new OperationalNotificationsService(
    { get: jest.fn() } as never,
    conduit as never,
    {} as never,
    recipients as never,
    executions as never,
    templates as never,
    {} as never,
  );
  return { service, conduit };
}

const sentVariables = (conduit: { sendWhatsappMessage: jest.Mock }) =>
  (
    conduit.sendWhatsappMessage.mock.calls[0] as [
      { variables: Record<string, string> },
    ]
  )[0].variables;

describe('aviso de citas en curso', () => {
  const longest = Array.from({ length: 8 }, (_, i) =>
    inProgressLine({
      clientName: `María Fernanda de los Ángeles Restrepo ${i}`,
      treatmentName: 'Ritual de hidratación profunda con keratina',
      scheduledStart: new Date(Date.UTC(2026, 10, 17, 15 + i)),
    }),
  );

  it('dice cuántas más hay cuando no caben todas', async () => {
    const { service, conduit } = build();

    await service.notifyAdminInProgress(
      { recipientId: 'a1', digestId: '2026-11-17', total: 23, lines: longest },
      ctx,
    );

    const variables = sentVariables(conduit);
    expect(variables.cantidad).toBe('23');
    expect(variables.citas.endsWith('…y 15 más en el panel')).toBe(true);
  });

  it('con 8 citas de nombres largos el mensaje completo cabe en WhatsApp', async () => {
    const { service, conduit } = build();
    await service.notifyAdminInProgress(
      { recipientId: 'a1', digestId: '2026-11-17', total: 23, lines: longest },
      ctx,
    );
    const variables = sentVariables(conduit);
    const template = CONDUIT_TEMPLATE_CATALOG.find(
      (t) => t.code === 'ADMIN_IN_PROGRESS',
    );
    const body = (template?.body ?? '')
      .replace('{{cantidad}}', variables.cantidad)
      .replace('{{citas}}', variables.citas);
    expect(body.length).toBeLessThan(1024);
    expect(body).toContain('registra cómo pagó cada clienta');
  });

  it('cada línea usa fecha corta y recorta nombres largos', () => {
    expect(longest[0]).toBe(
      '• 17 de nov, 10:00 a. m.: María Fernanda de los Ángeles… (Ritual de hidratación profund…)',
    );
  });
});
