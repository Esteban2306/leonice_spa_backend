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
  kind: 'RETRIES' as const,
  phone: '+573001112233',
  clientName: 'Angélica',
  reason: 'la cuenta destino no coincide con la del spa',
  attempts: 2,
};

describe('aviso al equipo por un comprobante', () => {
  it('varios rechazos: WhatsApp y correo con intentos y motivo', async () => {
    const { service, conduit, templates } = build(admin);

    await service.notifyAdminReceiptIssue(data, ctx);

    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_ADMIN_RECEIPT_RETRIES',
    );
    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_ADMIN_RECEIPT_RETRIES_EMAIL',
    );
    expect(conduit.sendWhatsappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '573144455235',
        variables: {
          cliente: 'Angélica',
          telefono: '+573001112233',
          motivo: data.reason,
          intentos: '2',
        },
      }),
    );
    expect(conduit.sendEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'spa@example.com' }),
    );
  });

  it('comprobante en revisión: usa su propia plantilla y no manda intentos', async () => {
    const { service, conduit, templates } = build(admin);

    await service.notifyAdminReceiptIssue(
      { ...data, kind: 'REVIEW', attempts: 1 },
      ctx,
    );

    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_ADMIN_RECEIPT_REVIEW',
    );
    const sent = (
      conduit.sendWhatsappMessage.mock.calls as [
        { variables: Record<string, string> },
      ][]
    )[0][0];
    expect(sent.variables).not.toHaveProperty('intentos');
  });

  it('sin correo configurado sale solo por WhatsApp', async () => {
    const { service, conduit } = build({ ...admin, email: null });

    await service.notifyAdminReceiptIssue(data, ctx);

    expect(conduit.sendWhatsappMessage).toHaveBeenCalledTimes(1);
    expect(conduit.sendEmailMessage).not.toHaveBeenCalled();
  });

  it('una clienta sin registrar ni teléfono se describe sin inventar datos', async () => {
    const { service, conduit } = build(admin);

    await service.notifyAdminReceiptIssue(
      { ...data, clientName: null, phone: null },
      ctx,
    );

    expect(conduit.sendWhatsappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          cliente: 'Cliente sin registrar',
          telefono: 'Número oculto por WhatsApp',
        }) as Record<string, string>,
      }),
    );
  });

  it('un destinatario desactivado no recibe nada y queda registrado', async () => {
    const { service, conduit, executions } = build({
      ...admin,
      isActive: false,
    });

    await service.notifyAdminReceiptIssue(data, ctx);

    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'SKIPPED' }),
    );
  });

  it('registra la ejecución al terminar', async () => {
    const { service, executions } = build(admin);

    await service.notifyAdminReceiptIssue(data, ctx);

    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADMIN_RECEIPT_NOTICE',
        result: 'EXECUTED',
      }),
    );
  });
});
