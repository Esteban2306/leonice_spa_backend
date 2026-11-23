import type { CatalogProductRecord } from '../../products/catalog/product-catalog.repository';
import {
  ALSO_IN_RITUAL_HINT,
  BOT_PRODUCTS_LIMIT,
  PROMOTION_HINT,
  RITUAL_ITEM_HINT,
  toBotProducts,
} from './bot-product-view';

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

const promo = (
  target: { productId?: string; productCategoryId?: string },
  discountPercentage = 20,
) => ({
  name: 'Semana del cuidado',
  discountPercentage,
  endsAt: new Date('2026-11-30T23:59:59-05:00'),
  productId: target.productId ?? null,
  productCategoryId: target.productCategoryId ?? null,
});

const record = (over: Record<string, unknown> = {}): CatalogProductRecord =>
  ({
    id: 'p1',
    kind: 'SINGLE',
    comboItems: [],
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

  describe('Rituales', () => {
    const shampoo = record();
    const mascarilla = record({
      id: 'p2',
      slug: 'mascarilla',
      name: 'Mascarilla hidratante',
      variants: [variant('300 ml', 60000)],
      recommendations: [],
    });
    const item = (product: CatalogProductRecord, quantity = 1) => ({
      quantity,
      variant: {
        ...product.variants[0],
        product: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          isActive: true,
          category: { isActive: true },
        },
      },
    });
    const ritual = record({
      id: 'r1',
      kind: 'COMBO',
      slug: 'ritual-hidratante',
      name: 'Ritual hidratante',
      tagline: 'Rutina completa para cabello seco',
      category: { id: 'c2', slug: 'combos', name: 'Combos' },
      variants: [variant('Ritual de 2 productos', 85000)],
      comboItems: [item(shampoo), item(mascarilla)],
      recommendations: [],
    });

    it('describe el Ritual con lo que incluye y el ahorro', () => {
      const result = toBotProducts([ritual, shampoo, mascarilla], 'ritual');
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0]).toMatchObject({
        type: 'ritual',
        name: 'Ritual hidratante',
        priceFrom: 85000,
        ritual: {
          separatePrice: 100000,
          savings: 15000,
          savingsPercent: 15,
          includes: [
            {
              name: 'Shampoo hidratante',
              presentation: '250 ml',
              quantity: 1,
              unitPrice: 40000,
            },
            {
              name: 'Mascarilla hidratante',
              presentation: '300 ml',
              quantity: 1,
              unitPrice: 60000,
            },
          ],
        },
        hint: RITUAL_ITEM_HINT,
      });
    });

    it('al preguntar por un producto incluido ofrece el Ritual una vez', () => {
      const result = toBotProducts([ritual, shampoo, mascarilla], 'shampoo');
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0]).toMatchObject({
        type: 'producto',
        name: 'Shampoo hidratante',
        alsoInRituals: [
          {
            name: 'Ritual hidratante',
            price: 85000,
            savings: 15000,
            savingsPercent: 15,
          },
        ],
        hint: ALSO_IN_RITUAL_HINT,
      });
    });

    it('un kit en promoción calcula el ahorro con el precio rebajado', () => {
      const result = toBotProducts([ritual, shampoo, mascarilla], 'ritual', [
        promo({ productId: 'r1' }),
      ]);
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0]).toMatchObject({
        type: 'ritual',
        promotion: {
          discount: '20 %',
          priceFrom: 68000,
          priceTo: 68000,
          validUntil: '30 de noviembre',
        },
        ritual: { separatePrice: 100000, savings: 32000, savingsPercent: 32 },
      });
      expect(result.products[0].hint).toContain(PROMOTION_HINT);
      expect(result.products[0].hint).toContain(RITUAL_ITEM_HINT);
    });

    it('al ofrecer el kit desde un producto usa el precio con promoción', () => {
      const result = toBotProducts([ritual, shampoo, mascarilla], 'shampoo', [
        promo({ productId: 'r1' }),
      ]);
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0].alsoInRituals[0]).toMatchObject({
        price: 68000,
        savings: 32000,
      });
    });

    it('si un producto del kit tiene su propia promoción, el ahorro se calcula con ese precio', () => {
      const result = toBotProducts([ritual, shampoo, mascarilla], 'ritual', [
        promo({ productId: 'r1' }),
        promo({ productId: 'p2' }, 10),
      ]);
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0].ritual).toMatchObject({
        separatePrice: 94000,
        savings: 26000,
      });
    });

    it('un kit sin ahorro real no dice que ahorra', () => {
      const costly = { ...ritual, variants: [variant('Ritual', 120000)] };
      const result = toBotProducts(
        [costly as unknown as CatalogProductRecord, shampoo, mascarilla],
        'ritual',
      );
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0].hint).toBeNull();
    });

    it('encuentra el Ritual por el nombre de sus productos', () => {
      const result = toBotProducts([ritual, mascarilla], 'mascarilla');
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products.map((product) => product.name)).toEqual([
        'Mascarilla hidratante',
        'Ritual hidratante',
      ]);
    });

    it('no ofrece un Ritual que no ahorra nada', () => {
      const expensive = record({
        ...ritual,
        variants: [variant('Ritual de 2 productos', 100000)],
      });
      const result = toBotProducts([expensive, shampoo], 'shampoo');
      if (result.status !== 'found') throw new Error('sin resultados');
      const found = result.products.find(
        (product) => product.name === 'Shampoo hidratante',
      );
      expect(found?.alsoInRituals).toEqual([]);
      expect(found?.hint).toBeNull();
    });

    it('un producto sin Ritual no trae pista', () => {
      const result = toBotProducts([shampoo], 'shampoo');
      if (result.status !== 'found') throw new Error('sin resultados');
      expect(result.products[0]).toMatchObject({
        type: 'producto',
        ritual: null,
        alsoInRituals: [],
        hint: null,
      });
    });
  });
});

describe('toBotProducts con promociones de productos', () => {
  it('da el precio con promoción por presentación y la vigencia', () => {
    const result = toBotProducts([record()], 'shampoo', [
      promo({ productId: 'p1' }, 15),
    ]);
    if (result.status !== 'found') throw new Error('sin resultados');
    expect(result.products[0].variants).toEqual([
      {
        brand: 'Kerastase',
        presentation: '250 ml',
        price: 40000,
        promoPrice: 34000,
      },
      {
        brand: 'Kerastase',
        presentation: '500 ml',
        price: 90000,
        promoPrice: 76500,
      },
    ]);
    expect(result.products[0].promotion).toEqual({
      name: 'Semana del cuidado',
      discount: '15 %',
      priceFrom: 34000,
      priceTo: 76500,
      validUntil: '30 de noviembre',
    });
    expect(result.products[0].hint).toBe(PROMOTION_HINT);
  });

  it('la promoción de la categoría de productos alcanza a sus productos', () => {
    const result = toBotProducts([record({ productCategoryId: 'c1' })], '', [
      promo({ productCategoryId: 'c1' }),
    ]);
    if (result.status !== 'found') throw new Error('sin resultados');
    expect(result.products[0].promotion?.priceFrom).toBe(32000);
  });

  it('sin búsqueda muestra primero lo que está en promoción', () => {
    const result = toBotProducts(
      [record(), record({ id: 'p9', name: 'Aceite capilar' })],
      '',
      [promo({ productId: 'p9' })],
    );
    if (result.status !== 'found') throw new Error('sin resultados');
    expect(result.products.map((p) => p.name)).toEqual([
      'Aceite capilar',
      'Shampoo hidratante',
    ]);
  });

  it('sin promoción no agrega precio rebajado', () => {
    const result = toBotProducts([record()], 'shampoo', [
      promo({ productId: 'otro' }),
    ]);
    if (result.status !== 'found') throw new Error('sin resultados');
    expect(result.products[0].promotion).toBeNull();
    expect(result.products[0].variants[0]).not.toHaveProperty('promoPrice');
  });
});
