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

const SETTINGS = {
  deliveryInfo: 'Envíos en Granada con pago contraentrega',
  pickupAddress: 'Calle 5 # 4-20, Granada',
  paymentMethods: 'Nequi 310 000 1122 a nombre de Leonice Arenas',
};

function build(
  placed: Record<string, unknown>,
  options: { preview?: unknown; settings?: typeof SETTINGS } = {},
) {
  const afterPurchase = jest.fn((_request: string) => Promise.resolve(null));
  const place = jest.fn((_input: unknown) => Promise.resolve(placed));
  const preview = jest.fn((_items: unknown) =>
    Promise.resolve(options.preview ?? pricedReady),
  );
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
      { publishAsync: jest.fn() } as never,
    ),
    { findAllCurrentlyValid: jest.fn(() => Promise.resolve([])) } as never,
    { afterPurchase, current: jest.fn(() => Promise.resolve([])) } as never,
    {
      place,
      preview,
      fulfillmentSettings: jest.fn(() =>
        Promise.resolve(options.settings ?? SETTINGS),
      ),
    } as never,
  );
  return { controller, place, afterPurchase };
}

const req = { conduitContact: { phone: '573001112233', lid: null } } as never;
const ready = {
  order: order([{ productName: 'Ritual Jolly Kids' }]),
  priced: pricedReady,
  created: true,
  teamNotified: true,
  paymentInstructions: SETTINGS.paymentMethods,
};

describe('POST conduit/products/purchase-request: antes de registrar el pedido', () => {
  it('sin entrega ni pago no crea nada: da el resumen y las opciones para preguntarle', async () => {
    const { controller, place } = build(ready);
    const out = await controller.productPurchaseRequest(
      { items: [{ producto: 'kit jolly kids', cantidad: 2 }] },
      req,
    );
    expect(place).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      expected: true,
      code: 'ORDER_DETAILS_MISSING',
      nextStep: 'ASK_CLIENT_DATA',
      requested: false,
      total: '$392.000',
      faltan: ['entrega', 'pago'],
    });
    const options = out as {
      opcionesEntrega: string[];
      opcionesPago: string[];
    };
    expect(options.opcionesEntrega.join(' ')).toContain('Granada');
    expect(options.opcionesEntrega.join(' ')).toContain('Calle 5');
    expect(options.opcionesPago.join(' ')).toContain('Transferencia');
  });

  it('a domicilio sin dirección la pide', async () => {
    const { controller, place } = build(ready);
    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit', cantidad: 1 }],
        entrega: 'DOMICILIO',
        pago: 'CONTRAENTREGA',
      },
      req,
    );
    expect(place).not.toHaveBeenCalled();
    expect(out).toMatchObject({ faltan: ['direccion'] });
  });

  it('no acepta contraentrega si lo recoge, ni domicilio si el spa no hace envíos', async () => {
    const { controller } = build(ready);
    const pickup = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit', cantidad: 1 }],
        entrega: 'RECOGER',
        pago: 'CONTRAENTREGA',
      },
      req,
    );
    expect(pickup).toMatchObject({ faltan: ['pago'] });
    const noDelivery = build(ready, {
      settings: { ...SETTINGS, deliveryInfo: null as never },
    });
    const out = await noDelivery.controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit', cantidad: 1 }],
        entrega: 'DOMICILIO',
        pago: 'TRANSFERENCIA',
        direccion: 'Cra 3 # 2-10',
      },
      req,
    );
    expect((out as { problema: string }).problema).toContain('no hay envíos');
  });

  it('si no se reconoce el producto o falta la presentación, no crea el pedido', async () => {
    const { controller, place } = build(ready, { preview: pricedMissing });
    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'shampoo jolly kids', cantidad: 1 }],
        entrega: 'RECOGER',
        pago: 'EN_TIENDA',
      },
      req,
    );
    expect(place).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      code: 'ORDER_ITEM_UNCLEAR',
      missing: [{ falta: 'presentación', options: ['300 ml', '500 ml'] }],
    });
  });

  it('sin productos ni texto pide el dato sin crear nada', async () => {
    const { controller, place } = build({});
    const out = await controller.productPurchaseRequest({}, req);
    expect(place).not.toHaveBeenCalled();
    expect(out).toMatchObject({ expected: true, code: 'ORDER_ITEMS_MISSING' });
  });
});

describe('POST conduit/products/purchase-request: pedido completo', () => {
  it('por transferencia y a domicilio: crea el pedido, da los métodos de pago y pide el comprobante', async () => {
    const { controller, place } = build(ready);
    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit jolly kids', cantidad: 2 }],
        entrega: 'DOMICILIO',
        pago: 'TRANSFERENCIA',
        direccion: 'Cra 3 # 2-10, barrio Centro',
      },
      req,
      'idem-1',
    );
    expect(place.mock.calls[0][0]).toMatchObject({
      clientId: 'c1',
      requestId: 'idem-1',
      fulfillment: {
        fulfillment: 'DOMICILIO',
        paymentMethod: 'TRANSFERENCIA',
        deliveryAddress: 'Cra 3 # 2-10, barrio Centro',
      },
    });
    expect(out).toMatchObject({
      requested: true,
      orderCode: 'P-0042',
      total: '$392.000',
      paymentInstructions: SETTINGS.paymentMethods,
      entrega: 'DOMICILIO',
      direccion: 'Cra 3 # 2-10, barrio Centro',
    });
    expect((out as { hint: string }).hint).toContain('comprobante');
  });

  it('si lo recoge y paga allá: no pide comprobante ni da datos de pago', async () => {
    const { controller } = build(ready);
    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit', cantidad: 1 }],
        entrega: 'RECOGER',
        pago: 'EN_TIENDA',
      },
      req,
    );
    expect(out).toMatchObject({
      paymentInstructions: null,
      recogerEn: SETTINGS.pickupAddress,
    });
    expect((out as { hint: string }).hint).toContain('No le pidas comprobante');
  });

  it('el pedido no agrega promociones de otros servicios o productos', async () => {
    const { controller, afterPurchase } = build(ready);
    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit', cantidad: 1 }],
        entrega: 'RECOGER',
        pago: 'TRANSFERENCIA',
      },
      req,
    );
    expect(afterPurchase).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty('closingOffer');
  });

  it('si no hay a quién avisar no promete que alguien escribirá', async () => {
    const { controller } = build({ ...ready, teamNotified: false });
    const out = await controller.productPurchaseRequest(
      {
        items: [{ producto: 'kit', cantidad: 1 }],
        entrega: 'RECOGER',
        pago: 'EN_TIENDA',
      },
      req,
    );
    expect((out as { message: string }).message).toContain('no prometas');
  });
});
