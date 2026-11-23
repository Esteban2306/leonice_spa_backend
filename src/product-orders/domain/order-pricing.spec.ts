import {
  findProduct,
  orderCode,
  parseOrderCode,
  priceOrder,
} from './order-pricing';

const CATALOG = [
  {
    id: 'kit',
    name: 'Ritual Jolly Kids',
    productCategoryId: 'combos',
    variants: [
      {
        id: 'kit-v',
        brand: 'Amazônica',
        presentation: 'Ritual de 4 productos',
        price: '245000',
      },
    ],
  },
  {
    id: 'shampoo',
    name: 'Shampoo Jolly Kids Amazônica',
    productCategoryId: 'care',
    variants: [
      { id: 's300', brand: 'Amazônica', presentation: '300 ml', price: 38000 },
      { id: 's500', brand: 'Amazônica', presentation: '500 ml', price: 60000 },
    ],
  },
  {
    id: 'purify',
    name: 'Shampoo Purify Amazônica',
    productCategoryId: 'care',
    variants: [
      { id: 'p300', brand: 'Amazônica', presentation: '300 ml', price: 55000 },
    ],
  },
];

const KIT_PROMO = {
  name: 'Kits con 20 %',
  discountPercentage: 20,
  endsAt: new Date('2026-11-22T23:59:59-05:00'),
  productId: 'kit',
  productCategoryId: null,
};

describe('precio de un pedido de productos', () => {
  it('cobra el kit con su promoción y suma por cantidad', () => {
    const order = priceOrder(
      CATALOG,
      [KIT_PROMO],
      [{ product: 'kit jolly kids', quantity: 2 }],
    );
    expect(order.items[0]).toMatchObject({
      variantId: 'kit-v',
      productName: 'Ritual Jolly Kids',
      unitPrice: 245000,
      promoPrice: 196000,
      promotion: 'Kits con 20 %',
      missing: null,
    });
    expect(order.total).toBe(392000);
  });

  it('sin promoción cobra el precio normal y elige la presentación pedida', () => {
    const order = priceOrder(
      CATALOG,
      [KIT_PROMO],
      [
        {
          product: 'Shampoo Jolly Kids Amazônica',
          presentation: '500ml',
          quantity: 1,
        },
        { product: 'shampoo purify', quantity: 1 },
      ],
    );
    expect(order.items.map((i) => [i.variantId, i.promoPrice])).toEqual([
      ['s500', null],
      ['p300', null],
    ]);
    expect(order.total).toBe(115000);
  });

  it('si falta la presentación no inventa precio: la pide con sus opciones y el total queda vacío', () => {
    const order = priceOrder(
      CATALOG,
      [],
      [{ product: 'Shampoo Jolly Kids Amazônica', quantity: 1 }],
    );
    expect(order.items[0]).toMatchObject({
      missing: 'PRESENTATION',
      unitPrice: null,
      options: ['300 ml', '500 ml'],
    });
    expect(order.total).toBeNull();
  });

  it('un producto que no está en el catálogo queda sin precio para que el equipo lo cotice', () => {
    const order = priceOrder(
      CATALOG,
      [],
      [{ product: 'Aceite de coco marca X', quantity: 1 }],
    );
    expect(order.items[0]).toMatchObject({
      missing: 'PRODUCT',
      unitPrice: null,
    });
    expect(order.total).toBeNull();
  });

  it('un nombre ambiguo no elige al azar', () => {
    expect(findProduct(CATALOG, 'shampoo')).toBeNull();
    expect(findProduct(CATALOG, 'Shampoo Purify')?.id).toBe('purify');
  });

  it('el código del pedido se lee aunque venga sin guion o con ceros', () => {
    expect(orderCode(42)).toBe('P-0042');
    expect(parseOrderCode('p0042')).toBe(42);
    expect(parseOrderCode('P-42')).toBe(42);
    expect(parseOrderCode('pedido 42')).toBeNull();
  });
});
