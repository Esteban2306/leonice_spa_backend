import { ConduitSupportToolsController } from './conduit-support-tools.controller';
import { TeamHandoffService } from './handoff/team-handoff.service';
import { memoryCache } from '../../test/helpers/memory-cache';

function build(results: boolean[], closingOffer: unknown = null) {
  const afterPurchase = jest.fn((_request: string) =>
    Promise.resolve(closingOffer),
  );
  const publishAsync = jest.fn((_type?: unknown, _payload?: unknown) =>
    Promise.resolve(results),
  );
  const clients = {
    findByPhone: jest.fn(() => Promise.resolve({ name: 'Diana' })),
  };
  const controller = new ConduitSupportToolsController(
    {} as never,
    clients as never,
    { publishAsync } as never,
    {} as never,
    {} as never,
    new TeamHandoffService(
      memoryCache() as never,
      clients as never,
      { publishAsync } as never,
    ),
    { findAllCurrentlyValid: jest.fn(() => Promise.resolve([])) } as never,
    {
      afterPurchase,
      current: jest.fn(() => Promise.resolve([])),
    } as never,
  );
  return { controller, publishAsync, afterPurchase };
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

describe('POST conduit/products/purchase-request · promoción para el cierre', () => {
  it('con el aviso enviado devuelve una promoción distinta a lo que pidió', async () => {
    const closing = { offer: { name: 'Hidratación profunda' }, hint: 'cierre' };
    const { controller, afterPurchase } = build([true], closing);
    const out = await controller.productPurchaseRequest(
      { request: '1 shampoo hidratante' },
      req,
      'idem-2',
    );
    expect(afterPurchase).toHaveBeenCalledWith('1 shampoo hidratante');
    expect(out).toMatchObject({ closingOffer: closing });
  });

  it('si no se pudo avisar al equipo no ofrece nada', async () => {
    const { controller, afterPurchase } = build([false], {
      offer: {},
      hint: '',
    });
    const out = await controller.productPurchaseRequest(
      { request: '1 shampoo' },
      req,
      'idem-3',
    );
    expect(afterPurchase).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty('closingOffer');
  });
});
