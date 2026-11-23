import { Decimal } from '@prisma/client/runtime/library';
import {
  isPubliclyVisible,
  queryCatalog,
  toProductDetail,
} from './product-catalog.mapper';
import type { CatalogProductRecord } from './product-catalog.repository';

const NOW = new Date('2026-11-16T00:00:00Z');

const category = (slug: string, displayOrder: number) => ({
  id: slug,
  name: slug === 'combos' ? 'Combos' : 'Amazônica',
  slug,
  description: null,
  iconKey: null,
  displayOrder,
});

function base(
  id: string,
  name: string,
  price: number,
  categorySlug: string,
): CatalogProductRecord {
  return {
    id,
    productCategoryId: categorySlug,
    name,
    slug: id,
    kind: 'SINGLE',
    comboItems: [],
    description: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    tagline: null,
    purpose: null,
    benefits: [],
    howToUse: [],
    idealFor: [],
    usageFrequency: null,
    precautions: [],
    contentNeedsReview: false,
    isFeatured: false,
    displayOrder: 0,
    category: category(categorySlug, categorySlug === 'combos' ? -1 : 0),
    variants: [
      {
        id: `${id}-v`,
        productId: id,
        brand: 'Amazônica',
        presentation: '300 ml',
        price: new Decimal(price),
        imageUrl: null,
        imagePublicId: null,
        isActive: true,
        createdAt: NOW,
      },
    ],
    tagAssignments: [],
    recommendations: [],
  };
}

const shampoo = base('shampoo', 'Shampoo Hair Therapy', 80000, 'amazonica');
const acondicionador = base(
  'acondicionador',
  'Acondicionador Hair Therapy',
  80000,
  'amazonica',
);
const mascarilla = base(
  'mascarilla',
  'Mascarilla Hair Therapy',
  90000,
  'amazonica',
);

function item(product: CatalogProductRecord, quantity = 1, isActive = true) {
  const variant = product.variants[0];
  return {
    quantity,
    variant: {
      id: variant.id,
      brand: variant.brand,
      presentation: variant.presentation,
      price: variant.price,
      isActive,
      imageUrl: variant.imageUrl,
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        isActive: product.isActive,
        productCategoryId: product.productCategoryId,
        category: { isActive: true },
      },
    },
  };
}

function ritual(
  items: ReturnType<typeof item>[],
  price = 215000,
): CatalogProductRecord {
  return {
    ...base(
      'ritual-hair-therapy',
      'Ritual Hair Therapy Amazônica',
      price,
      'combos',
    ),
    kind: 'COMBO',
    comboItems: items,
  };
}

describe('Rituales en el catálogo público', () => {
  const complete = ritual([
    item(shampoo),
    item(acondicionador),
    item(mascarilla),
  ]);
  const catalog = [complete, shampoo, acondicionador, mascarilla];

  it('la tarjeta trae el precio fijo, lo que costaría por separado y el ahorro', () => {
    const card = queryCatalog(catalog, { category: 'combos' }).items[0];
    expect(card.kind).toBe('ritual');
    expect(card.priceMinPesos).toBe(215000);
    expect(card.ritual).toEqual({
      separatePricePesos: 250000,
      savingsPesos: 35000,
      savingsPercent: 14,
      itemCount: 3,
    });
  });

  it('los productos normales no traen resumen de Ritual', () => {
    const card = queryCatalog(catalog, { category: 'amazonica' }).items[0];
    expect(card.kind).toBe('single');
    expect(card.ritual).toBeNull();
  });

  it('la categoría Combos sale primera y cuenta sus Rituales', () => {
    const facets = queryCatalog(catalog, {}).facets.categories;
    expect(facets[0]).toMatchObject({ slug: 'combos', count: 1 });
  });

  it('buscar un producto incluido también encuentra el Ritual', () => {
    const slugs = queryCatalog(catalog, { q: 'mascarilla' }).items.map(
      (card) => card.slug,
    );
    expect(slugs).toContain('ritual-hair-therapy');
  });

  it('el detalle del Ritual lista lo incluido con su precio individual y enlace', () => {
    const detail = toProductDetail(complete, catalog);
    expect(detail.ritualItems).toEqual([
      expect.objectContaining({
        productSlug: 'shampoo',
        presentation: '300 ml',
        quantity: 1,
        unitPricePesos: 80000,
      }),
      expect.objectContaining({ productSlug: 'acondicionador' }),
      expect.objectContaining({
        productSlug: 'mascarilla',
        unitPricePesos: 90000,
      }),
    ]);
  });

  it('el detalle de un producto incluido muestra en qué Ritual viene', () => {
    expect(toProductDetail(shampoo, catalog).includedIn).toEqual([
      {
        slug: 'ritual-hair-therapy',
        name: 'Ritual Hair Therapy Amazônica',
        pricePesos: 215000,
        savingsPercent: 14,
      },
    ]);
    expect(toProductDetail(shampoo, catalog).ritualItems).toEqual([]);
  });

  it('oculta un Ritual con un producto inactivo o con menos de dos productos', () => {
    expect(isPubliclyVisible(complete)).toBe(true);
    expect(
      isPubliclyVisible(ritual([item(shampoo), item(mascarilla, 1, false)])),
    ).toBe(false);
    expect(isPubliclyVisible(ritual([item(shampoo)]))).toBe(false);
    expect(isPubliclyVisible(shampoo)).toBe(true);
  });
});
