import type { CatalogProductRecord } from '../../products/catalog/product-catalog.repository';
import { BOT_PRODUCTS_LIMIT, toBotProducts } from './bot-product-view';

const variant = (presentation: string, price: number) => ({
  id: `v-${presentation}`,
  productId: 'p1',
  brand: 'Kerastase',
  presentation,
  price,
  imageUrl: null,
  imagePublicId: null,
  isActive: true,
  createdAt: new Date(),
});

const record = (over: Record<string, unknown> = {}): CatalogProductRecord =>
  ({
    id: 'p1',
    slug: 'shampoo-hidratante',
    name: 'Shampoo hidratante',
    tagline: 'Para cabello seco',
    purpose: 'Hidratar',
    description: 'Limpia sin resecar',
    benefits: ['Suavidad'],
    howToUse: ['Aplicar en cabello húmedo'],
    idealFor: ['Cabello seco'],
    usageFrequency: '2 veces por semana',
    precautions: ['Evitar contacto con ojos'],
    category: { id: 'c1', slug: 'cuidado', name: 'Cuidado capilar' },
    tagAssignments: [],
    variants: [variant('250 ml', 40000), variant('500 ml', 90000)],
    recommendations: [{ treatment: { id: 't1', name: 'Alisado orgánico' } }],
    ...over,
  }) as unknown as CatalogProductRecord;

describe('toBotProducts', () => {
  it('devuelve precio por presentación, especificaciones y aclara que no hay inventario', () => {
    const result = toBotProducts([record()], 'shampoo');

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.products[0]).toMatchObject({
      name: 'Shampoo hidratante',
      availability: 'IN_CATALOG',
      priceFrom: 40000,
      priceTo: 90000,
      howToUse: ['Aplicar en cabello húmedo'],
      usageFrequency: '2 veces por semana',
      precautions: ['Evitar contacto con ojos'],
      recommendedForTreatments: ['Alisado orgánico'],
    });
    expect(result.products[0].variants).toEqual([
      { brand: 'Kerastase', presentation: '250 ml', price: 40000 },
      { brand: 'Kerastase', presentation: '500 ml', price: 90000 },
    ]);
    expect(result.availabilityNote).toContain('no lleva inventario');
  });

  it('recomienda por tratamiento: encuentra el producto asociado a ese servicio', () => {
    const result = toBotProducts(
      [record({ id: 'p2', name: 'Mascarilla', recommendations: [] }), record()],
      'qué recomiendan para el alisado orgánico',
    );

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.products[0].name).toBe('Shampoo hidratante');
  });

  it('entiende una frase natural, sin acentos ni palabras de relleno', () => {
    const result = toBotProducts(
      [record(), record({ id: 'p2', name: 'Mascarilla', tagline: null })],
      '¿Cuánto cuesta el SHAMPOO para cabello seco?',
    );

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.products[0].name).toBe('Shampoo hidratante');
  });

  it('sin consulta lista el catálogo hasta el límite e informa el total', () => {
    const catalog = Array.from({ length: BOT_PRODUCTS_LIMIT + 3 }, (_, i) =>
      record({ id: `p${i}`, name: `Producto ${i}` }),
    );

    const result = toBotProducts(catalog, undefined);

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.shown).toBe(BOT_PRODUCTS_LIMIT);
    expect(result.total).toBe(BOT_PRODUCTS_LIMIT + 3);
  });

  it('un producto sin presentaciones activas no se ofrece', () => {
    expect(toBotProducts([record({ variants: [] })], 'shampoo').status).toBe(
      'not_found',
    );
  });

  it('una consulta sin coincidencias devuelve not_found y no inventa', () => {
    expect(toBotProducts([record()], 'perfume').status).toBe('not_found');
  });

  it('una consulta solo de relleno no devuelve productos al azar', () => {
    expect(toBotProducts([record()], 'que hay').status).toBe('not_found');
  });
});
