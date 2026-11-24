import { ProductOrderStatus } from '@prisma/client';
import { ProductOrdersService } from './product-orders.service';

const CATALOG = [
  {
    id: 'kit',
    name: 'Ritual Jolly Kids',
    productCategoryId: 'combos',
    variants: [
      {
        id: 'kit-v',
        brand: 'Amazônica',
        presentation: 'Ritual',
        price: 245000,
      },
    ],
  },
];

const PROMO = {
  name: 'Kits con 20 %',
  discountPercentage: 20,
  endsAt: new Date('2099-01-01'),
  productId: 'kit',
  productCategoryId: null,
};

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  number: 42,
  status: ProductOrderStatus.PENDIENTE_PAGO,
  phone: '+573001112233',
  lid: null,
  clientId: 'c1',
  clientName: 'Sandra Ruiz',
  total: 392000,
  priceHeldUntil: new Date(),
  proofReceivedAt: new Date(),
  items: [
    {
      productName: 'Ritual Jolly Kids',
      presentation: 'Ritual',
      quantity: 2,
      unitPrice: 245000,
      promoPrice: 196000,
    },
  ],
  ...overrides,
});

function build(open: unknown = null, byNumber: unknown = null) {
  const repository = {
    findOpen: jest.fn().mockResolvedValue(open),
    findByNumber: jest.fn().mockResolvedValue(byNumber),
    findById: jest.fn().mockResolvedValue(open),
    create: jest.fn((data: { total: number | null }) =>
      Promise.resolve(stored({ total: data.total })),
    ),
    replaceItems: jest.fn((_id: string, data: { total: number | null }) =>
      Promise.resolve(stored({ total: data.total })),
    ),
    update: jest.fn((_id: string, data: Record<string, unknown>) =>
      Promise.resolve(stored(data)),
    ),
  };
  const eventBus = {
    publishAsync: jest.fn().mockResolvedValue([true]),
    publish: jest.fn(),
  };
  const service = new ProductOrdersService(
    repository as never,
    { listRecords: jest.fn().mockResolvedValue(CATALOG) } as never,
    { findAllCurrentlyValid: jest.fn().mockResolvedValue([PROMO]) } as never,
    {
      get: jest.fn().mockResolvedValue({
        productPaymentInstructions: null,
        depositInstructions: 'Nequi 310 000 1122',
        address: 'Calle 5 # 4-20, Granada',
      }),
    } as never,
    {
      uploadProductPaymentProofFromBase64: jest
        .fn()
        .mockResolvedValue({ url: 'https://img/p.jpg', publicId: 'p' }),
    } as never,
    eventBus as never,
  );
  return { service, repository, eventBus };
}

const contact = { phone: '+573001112233', lid: null };
const placeInput = {
  contact,
  clientId: 'c1',
  clientName: 'Sandra Ruiz',
  items: [{ product: 'kit jolly kids', quantity: 2 }],
  request: null,
  notes: null,
  requestId: 'r1',
};

describe('ProductOrdersService', () => {
  it('crea el pedido con el total con promoción, avisa al equipo y usa la cuenta del anticipo si no hay una de productos', async () => {
    const { service, repository, eventBus } = build();
    const out = await service.place(placeInput);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 392000 }),
    );
    expect(out).toMatchObject({
      created: true,
      teamNotified: true,
      paymentInstructions: 'Nequi 310 000 1122',
    });
    const notice = (eventBus.publishAsync.mock.calls as unknown[][])[0][1] as {
      request: string;
    };
    expect(notice.request).toContain('Pedido P-0042');
    expect(notice.request).toContain('Total: $392.000');
  });

  it('si ya tiene un pedido sin pagar lo actualiza y no vuelve a avisar al equipo', async () => {
    const { service, repository, eventBus } = build(stored());
    const out = await service.place(placeInput);
    expect(repository.replaceItems).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ total: 392000 }),
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(eventBus.publishAsync).not.toHaveBeenCalled();
    expect(out.created).toBe(false);
  });

  it('el comprobante pasa el pedido a revisión, compara el monto y avisa al equipo', async () => {
    const { service, repository, eventBus } = build(stored());
    const out = await service.registerPayment({
      contact,
      imageBase64: 'data:image/jpeg;base64,AAAA',
      amountSeen: 336000,
    });
    expect(repository.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        status: ProductOrderStatus.PAGO_EN_REVISION,
        proofImageUrl: 'https://img/p.jpg',
        proofAmount: 336000,
      }),
    );
    expect(out).toMatchObject({ amountSeen: 336000, amountMatches: false });
    expect((eventBus.publishAsync.mock.calls as unknown[][])[0][0]).toBe(
      'product_order.payment_received',
    );
  });

  it('si la promoción terminó antes del comprobante, el pedido se recalcula con el precio normal', async () => {
    const { service, repository } = build(
      stored({ priceHeldUntil: new Date(Date.now() - 60_000) }),
    );
    (
      service as unknown as { promotions: { findAllCurrentlyValid: jest.Mock } }
    ).promotions.findAllCurrentlyValid.mockResolvedValue([]);
    repository.update.mockImplementation(
      (_id: string, data: Record<string, unknown>) =>
        Promise.resolve(stored({ ...data, total: 490000 })),
    );
    const out = await service.registerPayment({
      contact,
      imageBase64: 'data:image/jpeg;base64,AAAA',
      amountSeen: 392000,
    });
    expect(repository.replaceItems).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ total: 490000, priceHeldUntil: null }),
    );
    expect(out).toMatchObject({ previousTotal: 392000, amountMatches: false });
  });

  it('con la promoción vigente el precio del pedido aplica hasta que termina', async () => {
    const { service, repository } = build();
    await service.place(placeInput);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ priceHeldUntil: PROMO.endsAt }),
    );
  });

  it('sin pedido abierto no sube nada', async () => {
    const { service, repository } = build(null);
    const out = await service.registerPayment({
      contact,
      imageBase64: 'data:image/jpeg;base64,AAAA',
    });
    expect(out.order).toBeNull();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('no registra el pago en el pedido de otra clienta aunque nombre su código', async () => {
    const { service, repository } = build(
      null,
      stored({ phone: '+573009999999' }),
    );
    const out = await service.registerPayment({
      contact,
      orderCode: 'P-0042',
      imageBase64: 'data:image/jpeg;base64,AAAA',
    });
    expect(out.order).toBeNull();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('verificar el pedido lo deja listo y le avisa a la clienta dónde recogerlo', async () => {
    const { service, repository, eventBus } = build(
      stored({
        status: ProductOrderStatus.PAGO_EN_REVISION,
        fulfillment: 'RECOGER',
        paymentMethod: 'EN_TIENDA',
      }),
    );
    await service.verifyPayment('o1', 'u1');
    expect(repository.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        status: ProductOrderStatus.PAGADO,
        verifiedByUserId: 'u1',
      }),
    );
    const [type, payload] = eventBus.publish.mock.calls[0] as [
      string,
      { orderId: string; detail: string },
    ];
    expect(type).toBe('product_order.verified');
    expect(payload.orderId).toBe('o1');
    expect(payload.detail).toContain('Calle 5 # 4-20, Granada');
  });

  it('rechazar el pago lo devuelve a pendiente con el motivo y avisa a la clienta', async () => {
    const { service, repository, eventBus } = build(
      stored({ status: ProductOrderStatus.PAGO_EN_REVISION }),
    );
    await service.rejectPayment('o1', 'el monto no coincide');
    expect(repository.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        status: ProductOrderStatus.PENDIENTE_PAGO,
        rejectionReason: 'el monto no coincide',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'product_order.payment_rejected',
      { orderId: 'o1', reason: 'el monto no coincide' },
    );
  });

  it('se puede marcar entregado aunque no se haya verificado antes, pero no uno cancelado', async () => {
    const { service, repository } = build(stored());
    await service.markDelivered('o1');
    expect(repository.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ status: ProductOrderStatus.ENTREGADO }),
    );
    const cancelled = build(stored({ status: ProductOrderStatus.CANCELADO }));
    await expect(cancelled.service.markDelivered('o1')).rejects.toMatchObject({
      code: 'PRODUCT_ORDER_INVALID_STATUS',
    });
  });
});
