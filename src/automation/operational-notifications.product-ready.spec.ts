import { OperationalNotificationsService } from './operational-notifications.service';

const ctx = { idempotencyKey: 'k1', companyEventId: 'e1' };

function build(order: Record<string, unknown> | null) {
  const conduit = {
    sendWhatsappMessage: jest
      .fn()
      .mockResolvedValue({ delivered: true, messageId: 'm1' }),
  };
  const executions = { log: jest.fn().mockResolvedValue(undefined) };
  const templates = {
    resolve: jest.fn((envKey: string) => Promise.resolve(`id:${envKey}`)),
  };
  const prisma = {
    client: {
      productOrder: { findUnique: jest.fn().mockResolvedValue(order) },
    },
  };
  const service = new OperationalNotificationsService(
    { get: jest.fn() } as never,
    conduit as never,
    {} as never,
    {} as never,
    executions as never,
    templates as never,
    prisma as never,
  );
  return { service, conduit, executions, templates };
}

describe('aviso a la clienta cuando su pedido está listo', () => {
  it('le escribe con la plantilla de pedido listo y el detalle de cómo lo recibe', async () => {
    const { service, conduit, templates } = build({
      id: 'o1',
      number: 7,
      phone: '+573108525522',
      clientName: 'Luz Marina Vargas',
      clientId: 'c1',
      items: [],
    });
    await service.notifyClientProductOrderReady(
      {
        orderId: 'o1',
        detail: 'tu pedido *P-0007* ya está listo: puedes recogerlo en el spa.',
      },
      ctx,
    );
    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_CLIENT_PRODUCT_ORDER_READY',
    );
    expect(conduit.sendWhatsappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+573108525522',
        variables: {
          nombre: 'Luz',
          detalle:
            'tu pedido *P-0007* ya está listo: puedes recogerlo en el spa.',
        },
      }),
    );
  });

  it('sin teléfono no envía nada y deja el motivo', async () => {
    const { service, conduit, executions } = build({
      id: 'o1',
      number: 7,
      phone: null,
      clientName: null,
      items: [],
    });
    await service.notifyClientProductOrderReady({ orderId: 'o1' }, ctx);
    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'SKIPPED' }),
    );
  });
});
