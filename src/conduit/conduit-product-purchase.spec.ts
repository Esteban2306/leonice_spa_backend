import { ConduitSupportToolsController } from './conduit-support-tools.controller';
import { TeamHandoffService } from './handoff/team-handoff.service';
import { memoryCache } from '../../test/helpers/memory-cache';

const order = (items: Array<{ productName: string }> = []) => ({
  number: 42,
  status: 'PENDIENTE_PAGO',
  priceHeldUntil: new Date('2026-11-23T20:00:00-05:00'),
  items,
});

const pricedReady = {
  items: [
    {
      variantId: 'kit-v',
      productName: 'Ritual Jolly Kids',
      presentation: 'Ritual de 4 productos',
      quantity: 2,
      unitPrice: 245000,
      promoPrice: 196000,
      promotion: 'Kits con 20 %',
      missing: null,
      options: [],
    },
  ],
  total: 392000,
};

const pricedMissing = {
  items: [
    {
      variantId: null,
      productName: 'Shampoo Jolly Kids Amazônica',
      presentation: null,
      quantity: 1,
      unitPrice: null,
      promoPrice: null,
      promotion: null,
      missing: 'PRESENTATION',
      options: ['300 ml', '500 ml'],
    },
  ],
  total: null,
};

function build(placed: Record<string, unknown>, closingOffer: unknown = null) {
  const afterPurchase = jest.fn((_request: string) =>
    Promise.resolve(closingOffer),
  );
  const place = jest.fn((_input: unknown) => Promise.resolve(placed));
  const clients = {
    findByPhone: jest.fn(() => Promise.resolve({ id: 'c1', name: 'Diana' })),
  };
  const controller = new ConduitSupportToolsController(
    {} as never,
    clients as never,
    {} as never,
    {} as never,
    {} as never,
    new TeamHandoffService(
      memoryCache() as never,
      clients as never,
      {
        publishAsync: jest.fn(),
      } as never,
    ),
    { findAllCurrentlyValid: jest.fn(() => Promise.resolve([])) } as never,
    {
      afterPurchase,
      current: jest.fn(() => Promise.resolve([])),
    } as never,
    { place } as never,
  );
  return { controller, place, afterPurchase };
}

const req = { conduitContact: { phone: '573001112233', lid: null } } as never;

describe('POST conduit/products/purchase-request: el pedido', () => {
  it('crea el pedido con lo que pidió y devuelve código, precios, total y cómo pagar', async () => {
    const { controller, place } = build({
      order: order([{ productName: 'Ritual Jolly Kids' }]),
      priced: pricedReady,
      created: true,
      teamNotified: true,
      paymentInstructions: 'Nequi 310 000 1122 a nombre de Leonice Arenas',
    });

    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit jolly kids', cantidad: 2 }],
        notes: 'Pasa el sábado',
      },
      req,
      'idem-1',
    );

    expect(place.mock.calls[0][0]).toMatchObject({
      contact: { phone: '573001112233', lid: null },
      clientId: 'c1',
      clientName: 'Diana',
      items: [{ product: 'kit jolly kids', presentation: null, quantity: 2 }],
      notes: 'Pasa el sábado',
      requestId: 'idem-1',
    });
    expect(out).toMatchObject({
      requested: true,
      teamNotified: true,
      updated: false,
      orderCode: 'P-0042',
      total: '$392.000',
      paymentInstructions: 'Nequi 310 000 1122 a nombre de Leonice Arenas',
      items: [{ precio: '$245.000', precioPromocion: '$196.000' }],
    });
    expect((out as { hint: string }).hint).toContain('paymentInstructions');
  });

  it('si falta la presentación no da cuenta ni total: pide el dato con sus opciones', async () => {
    const { controller } = build({
      order: order(),
      priced: pricedMissing,
      created: true,
      teamNotified: true,
      paymentInstructions: 'Nequi 310',
    });
    const out = await controller.productPurchaseRequest(
      { items: [{ producto: 'shampoo jolly kids', cantidad: 1 }] },
      req,
    );
    expect(out).toMatchObject({
      total: null,
      paymentInstructions: null,
      missing: [{ falta: 'presentación', options: ['300 ml', '500 ml'] }],
    });
    expect((out as { hint: string }).hint).toContain('missing');
  });

  it('con solo el texto libre igual crea el pedido para que no se pierda', async () => {
    const { controller, place } = build({
      order: order(),
      priced: pricedMissing,
      created: true,
      teamNotified: true,
      paymentInstructions: null,
    });
    await controller.productPurchaseRequest(
      { request: '1 mascarilla de 500 ml' },
      req,
    );
    expect(place.mock.calls[0][0]).toMatchObject({
      items: [{ product: '1 mascarilla de 500 ml', quantity: 1 }],
    });
  });

  it('sin productos ni texto pide el dato sin crear nada', async () => {
    const { controller, place } = build({});
    const out = await controller.productPurchaseRequest({}, req);
    expect(place).not.toHaveBeenCalled();
    expect(out).toMatchObject({ expected: true, code: 'ORDER_ITEMS_MISSING' });
  });

  it('si no hay a quién avisar no promete que alguien escribirá', async () => {
    const { controller } = build({
      order: order(),
      priced: pricedReady,
      created: true,
      teamNotified: false,
      paymentInstructions: null,
    });
    const out = await controller.productPurchaseRequest(
      { items: [{ producto: 'kit', cantidad: 1 }] },
      req,
    );
    expect(out).toMatchObject({ teamNotified: false });
    expect((out as { message: string }).message).toContain('no prometas');
  });
});

describe('POST conduit/products/purchase-request · promoción para el cierre', () => {
  it('al crear el pedido no agrega promociones de otros servicios o productos', async () => {
    const closing = { offer: { name: 'Hidratación profunda' }, hint: 'cierre' };
    const { controller, afterPurchase } = build(
      {
        order: order([{ productName: 'Shampoo hidratante' }]),
        priced: pricedReady,
        created: true,
        teamNotified: true,
        paymentInstructions: null,
      },
      closing,
    );
    const out = await controller.productPurchaseRequest(
      { items: [{ producto: 'shampoo hidratante', cantidad: 1 }] },
      req,
    );
    expect(afterPurchase).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty('closingOffer');
  });

  it('al actualizar un pedido abierto no repite la oferta', async () => {
    const { controller, afterPurchase } = build(
      {
        order: order([{ productName: 'Shampoo' }]),
        priced: pricedReady,
        created: false,
        teamNotified: true,
        paymentInstructions: null,
      },
      { offer: {}, hint: '' },
    );
    const out = await controller.productPurchaseRequest(
      { items: [{ producto: 'shampoo', cantidad: 2 }] },
      req,
    );
    expect(afterPurchase).not.toHaveBeenCalled();
    expect(out).toMatchObject({ updated: true });
    expect(out).not.toHaveProperty('closingOffer');
  });
});
