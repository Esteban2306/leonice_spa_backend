import { OperationalNotificationsService } from './operational-notifications.service';

const ctx = { idempotencyKey: 'k1', companyEventId: 'e1' };

function build(recipient: Record<string, unknown> | null) {
  const conduit = {
    sendWhatsappMessage: jest
      .fn()
      .mockResolvedValue({ delivered: true, messageId: 'm1' }),
    sendEmailMessage: jest
      .fn()
      .mockResolvedValue({ delivered: true, messageId: 'm2' }),
  };
  const recipients = { findById: jest.fn().mockResolvedValue(recipient) };
  const executions = { log: jest.fn().mockResolvedValue(undefined) };
  const templates = {
    resolve: jest.fn((envKey: string) => Promise.resolve(`id:${envKey}`)),
  };
  const service = new OperationalNotificationsService(
    { get: jest.fn() } as never,
    conduit as never,
    {} as never,
    recipients as never,
    executions as never,
    templates as never,
  );
  return { service, conduit, executions, templates };
}

const admin = {
  id: 'a1',
  isActive: true,
  phone: '573144455235',
  email: 'spa@example.com',
};

const data = {
  recipientId: 'a1',
  phone: '573001112233',
  lid: null,
  clientName: 'Angélica',
  request: '2 shampoos hidratantes Kerastase de 250 ml',
  notes: 'Los recoge el viernes',
};

describe('aviso al equipo por una compra de producto', () => {
  it('manda a WhatsApp y correo el número de la clienta y lo que quiere comprar', async () => {
    const { service, conduit, templates } = build(admin);

    await service.notifyAdminProductPurchase(data, ctx);

    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PURCHASE',
    );
    expect(conduit.sendWhatsappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '573144455235',
        variables: {
          cliente: 'Angélica',
          telefono: '573001112233',
          pedido: data.request,
          notas: 'Los recoge el viernes',
        },
      }),
    );
    expect(conduit.sendEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'spa@example.com' }),
    );
  });

  it('sin notas ni registro no inventa datos', async () => {
    const { service, conduit } = build(admin);

    await service.notifyAdminProductPurchase(
      { ...data, clientName: null, notes: null },
      ctx,
    );

    const sent = (
      conduit.sendWhatsappMessage.mock.calls as [
        { variables: Record<string, string> },
      ][]
    )[0][0];
    expect(sent.variables).toMatchObject({
      cliente: 'Cliente sin registrar',
      notas: 'Sin notas',
    });
  });

  it('un destinatario inactivo se omite sin enviar nada', async () => {
    const { service, conduit, executions } = build(null);

    await service.notifyAdminProductPurchase(data, ctx);

    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'SKIPPED' }),
    );
  });
});
