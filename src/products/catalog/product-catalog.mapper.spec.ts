import { Decimal } from '@prisma/client/runtime/library';
import { queryCatalog, toProductDetail } from './product-catalog.mapper';
import type { CatalogProductRecord } from './product-catalog.repository';

const NOW = new Date('2026-10-15T00:00:00Z');

const CATEGORIES = {
  shampoo: {
    id: 'c1',
    name: 'Shampoo',
    slug: 'shampoo',
    description: null,
    iconKey: 'droplets',
    displayOrder: 0,
  },
  mascarilla: {
    id: 'c2',
    name: 'Mascarilla',
    slug: 'mascarilla',
    description: null,
    iconKey: 'layers',
    displayOrder: 1,
  },
};

function product(
  id: string,
  name: string,
  category: keyof typeof CATEGORIES,
  tags: string[],
  priceList: number[],
): CatalogProductRecord {
  return {
    id,
    productCategoryId: CATEGORIES[category].id,
    name,
    slug: id,
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
    category: CATEGORIES[category],
    variants: priceList.map((price, index) => ({
      id: `${id}-v${index}`,
      productId: id,
      brand: 'MAIS',
      presentation: `${index + 1}`,
      price: new Decimal(price),
      imageUrl: null,
      imagePublicId: null,
      isActive: true,
      createdAt: NOW,
    })),
    tagAssignments: tags.map((tag) => ({
      id: `${id}-${tag}`,
      productId: id,
      tagId: tag,
      createdAt: NOW,
      tag: { id: tag, name: tag.toUpperCase(), slug: tag },
    })),
    recommendations: [],
  };
}

const CATALOG = [
  product(
    'reparador',
    'Shampoo reparador',
    'shampoo',
    ['brillo', 'reparacion'],
    [45000, 118000],
  ),
  product('detox', 'Shampoo detox', 'shampoo', ['grasa'], [42000]),
  product(
    'nutricion',
    'Mascarilla de nutrición',
    'mascarilla',
    ['brillo'],
    [58000, 96000],
  ),
];

describe('queryCatalog', () => {
  it('filtra por categoría y recalcula las facetas sin perder las demás categorías', () => {
    const result = queryCatalog(CATALOG, { category: 'shampoo' });

    expect(result.items.map((item) => item.slug)).toEqual([
      'detox',
      'reparador',
    ]);
    expect(result.facets.categories).toEqual([
      expect.objectContaining({ slug: 'shampoo', count: 2 }),
      expect.objectContaining({ slug: 'mascarilla', count: 1 }),
    ]);
    expect(result.facets.tags).toEqual([
      { slug: 'brillo', name: 'BRILLO', count: 1 },
      { slug: 'grasa', name: 'GRASA', count: 1 },
      { slug: 'reparacion', name: 'REPARACION', count: 1 },
    ]);
  });

  it('combina etiquetas como "cualquiera de" y cuenta categorías con ese filtro', () => {
    const result = queryCatalog(CATALOG, { tags: ['brillo'] });

    expect(result.items.map((item) => item.slug).sort()).toEqual([
      'nutricion',
      'reparador',
    ]);
    expect(result.facets.categories.map((option) => option.count)).toEqual([
      1, 1,
    ]);
  });

  it('sin tamaño de página devuelve todo el catálogo en una sola página', () => {
    const result = queryCatalog(CATALOG, {});

    expect(result.items).toHaveLength(CATALOG.length);
    expect(result).toMatchObject({ page: 1, pageSize: null, pageCount: 1 });
  });

  it('pagina el resultado y conserva el total y las facetas', () => {
    const first = queryCatalog(CATALOG, { pageSize: 2, page: 1 });
    const second = queryCatalog(CATALOG, { pageSize: 2, page: 2 });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(CATALOG.length - 2);
    expect(first.total).toBe(CATALOG.length);
    expect(first.pageCount).toBe(Math.ceil(CATALOG.length / 2));
    expect(first.facets).toEqual(second.facets);
    expect(
      [...first.items, ...second.items].map((item) => item.slug).sort(),
    ).toEqual(CATALOG.map((product) => product.slug).sort());
  });

  it('ajusta una página fuera de rango a la última', () => {
    const result = queryCatalog(CATALOG, { pageSize: 2, page: 99 });

    expect(result.page).toBe(result.pageCount);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('filtra por rango de precio si alguna presentación cae dentro', () => {
    const result = queryCatalog(CATALOG, { maxPrice: 44000 });

    expect(result.items.map((item) => item.slug)).toEqual(['detox']);
    expect(result.facets.price).toEqual({ minPesos: 42000, maxPesos: 118000 });
  });

  it('busca sin tildes en nombre, categoría y etiquetas', () => {
    expect(
      queryCatalog(CATALOG, { q: 'nutricion' }).items.map((item) => item.slug),
    ).toEqual(['nutricion']);
    expect(queryCatalog(CATALOG, { q: 'reparacion' }).total).toBe(1);
  });

  it('ordena por precio y por nombre', () => {
    expect(
      queryCatalog(CATALOG, { sort: 'price-desc' }).items.map(
        (item) => item.slug,
      ),
    ).toEqual(['nutricion', 'reparador', 'detox']);
    expect(queryCatalog(CATALOG, { sort: 'name' }).items[0].slug).toBe(
      'nutricion',
    );
  });
});

describe('toProductDetail', () => {
  it('relaciona por categoría y etiquetas sin incluirse a sí mismo', () => {
    const detail = toProductDetail(CATALOG[0], CATALOG);

    expect(detail.related.map((item) => item.slug)).toEqual([
      'detox',
      'nutricion',
    ]);
    expect(detail.priceMinPesos).toBe(45000);
    expect(detail.priceMaxPesos).toBe(118000);
  });
});
