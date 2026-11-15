import { ConduitSupportToolsController } from './conduit-support-tools.controller';

function build(results: boolean[]) {
  const publishAsync = jest.fn((_type?: unknown, _payload?: unknown) =>
    Promise.resolve(results),
  );
  const controller = new ConduitSupportToolsController(
    {} as never,
    { findByPhone: jest.fn(() => Promise.resolve({ name: 'Diana' })) } as never,
    { publishAsync } as never,
    {} as never,
  );
  return { controller, publishAsync };
}

const req = { conduitContact: { phone: '573001112233', lid: null } } as never;

describe('POST conduit/products/purchase-request', () => {
  it('avisa al equipo con el número verificado y lo que pidió la clienta', async () => {
    const { controller, publishAsync } = build([true]);

    const out = await controller.productPurchaseRequest(
      { request: '1 mascarilla de 500 ml', notes: 'Pasa el sábado' },
      req,
      'idem-1',
    );

    expect(out).toMatchObject({ requested: true, teamNotified: true });
    expect(publishAsync.mock.calls[0][0]).toBe(
      'conduit.product_purchase_requested',
    );
    expect(publishAsync.mock.calls[0][1]).toMatchObject({
      phone: '573001112233',
      clientName: 'Diana',
      request: '1 mascarilla de 500 ml',
      notes: 'Pasa el sábado',
      requestId: 'idem-1',
    });
  });

  it('si no hay a quién avisar no promete que alguien escribirá', async () => {
    const { controller } = build([false]);

    const out = await controller.productPurchaseRequest(
      { request: 'shampoo' },
      req,
      'idem-2',
    );

    expect(out).toMatchObject({ requested: false, teamNotified: false });
    expect(out.message).toContain('no prometas');
  });
});
