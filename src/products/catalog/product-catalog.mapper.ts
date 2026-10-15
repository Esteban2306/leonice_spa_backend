import type { CatalogProductRecord } from './product-catalog.repository';

export type CatalogSort = 'featured' | 'price-asc' | 'price-desc' | 'name';

export interface CatalogFilters {
  category?: string;
  tags?: string[];
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: CatalogSort;
}

export interface CatalogVariant {
  id: string;
  brand: string;
  presentation: string;
  pricePesos: number;
  imageUrl: string | null;
}

export interface CatalogFacetOption {
  slug: string;
  name: string;
  count: number;
}

export interface CatalogProductCard {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  purpose: string | null;
  category: { slug: string; name: string };
  tags: { slug: string; name: string }[];
  benefits: string[];
  howToUseCount: number;
  priceMinPesos: number | null;
  priceMaxPesos: number | null;
  brands: string[];
  imageUrl: string | null;
  variants: CatalogVariant[];
}

export interface CatalogProductDetail extends CatalogProductCard {
  description: string | null;
  howToUse: string[];
  idealFor: string[];
  usageFrequency: string | null;
  precautions: string[];
  contentNeedsReview: boolean;
  treatments: {
    name: string;
    slug: string;
    tagline: string | null;
    categorySlug: string;
    categoryName: string;
  }[];
  related: CatalogProductCard[];
}

export interface CatalogResult {
  items: CatalogProductCard[];
  total: number;
  facets: {
    categories: (CatalogFacetOption & {
      iconKey: string | null;
      description: string | null;
    })[];
    tags: CatalogFacetOption[];
    price: { minPesos: number | null; maxPesos: number | null };
  };
  applied: Required<Pick<CatalogFilters, 'tags' | 'sort'>> &
    Omit<CatalogFilters, 'tags' | 'sort'>;
}

const RELATED_LIMIT = 4;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function prices(product: CatalogProductRecord): number[] {
  return product.variants.map((variant) => Number(variant.price));
}

function minPrice(product: CatalogProductRecord): number | null {
  const values = prices(product);
  return values.length > 0 ? Math.min(...values) : null;
}

function maxPrice(product: CatalogProductRecord): number | null {
  const values = prices(product);
  return values.length > 0 ? Math.max(...values) : null;
}

function matchesQuery(product: CatalogProductRecord, q: string): boolean {
  const needle = normalize(q.trim());
  if (!needle) return true;
  const haystack = [
    product.name,
    product.tagline,
    product.purpose,
    product.description,
    product.category.name,
    ...product.benefits,
    ...product.tagAssignments.map((assignment) => assignment.tag.name),
    ...product.variants.flatMap((variant) => [
      variant.brand,
      variant.presentation,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalize)
    .join(' ');
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

type FacetKey = 'category' | 'tags' | 'price';

function passes(
  product: CatalogProductRecord,
  filters: CatalogFilters,
  ignore?: FacetKey,
): boolean {
  if (ignore !== 'category' && filters.category) {
    if (product.category.slug !== filters.category) return false;
  }
  if (ignore !== 'tags' && filters.tags && filters.tags.length > 0) {
    const slugs = new Set(
      product.tagAssignments.map((assignment) => assignment.tag.slug),
    );
    if (!filters.tags.some((tag) => slugs.has(tag))) return false;
  }
  if (ignore !== 'price') {
    const low = minPrice(product);
    const high = maxPrice(product);
    if (
      filters.minPrice !== undefined &&
      (high === null || high < filters.minPrice)
    )
      return false;
    if (
      filters.maxPrice !== undefined &&
      (low === null || low > filters.maxPrice)
    )
      return false;
  }
  if (filters.q && !matchesQuery(product, filters.q)) return false;
  return true;
}

function sortProducts(
  products: CatalogProductRecord[],
  sort: CatalogSort,
): CatalogProductRecord[] {
  const copy = [...products];
  const byName = (a: CatalogProductRecord, b: CatalogProductRecord) =>
    a.name.localeCompare(b.name, 'es');
  if (sort === 'name') return copy.sort(byName);
  if (sort === 'price-asc' || sort === 'price-desc') {
    const direction = sort === 'price-asc' ? 1 : -1;
    return copy.sort((a, b) => {
      const pa = minPrice(a);
      const pb = minPrice(b);
      if (pa === null && pb === null) return byName(a, b);
      if (pa === null) return 1;
      if (pb === null) return -1;
      return (pa - pb) * direction || byName(a, b);
    });
  }
  return copy.sort(
    (a, b) =>
      a.category.displayOrder - b.category.displayOrder ||
      a.displayOrder - b.displayOrder ||
      byName(a, b),
  );
}

export function toProductCard(
  product: CatalogProductRecord,
): CatalogProductCard {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    purpose: product.purpose,
    category: { slug: product.category.slug, name: product.category.name },
    tags: product.tagAssignments.map((assignment) => ({
      slug: assignment.tag.slug,
      name: assignment.tag.name,
    })),
    benefits: product.benefits,
    howToUseCount: product.howToUse.length,
    priceMinPesos: minPrice(product),
    priceMaxPesos: maxPrice(product),
    brands: [...new Set(product.variants.map((variant) => variant.brand))],
    imageUrl:
      product.variants.find((variant) => variant.imageUrl)?.imageUrl ?? null,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      brand: variant.brand,
      presentation: variant.presentation,
      pricePesos: Number(variant.price),
      imageUrl: variant.imageUrl,
    })),
  };
}

function countFacet<T extends { slug: string; name: string }>(
  products: CatalogProductRecord[],
  pick: (product: CatalogProductRecord) => T[],
): Map<string, T & { count: number }> {
  const counts = new Map<string, T & { count: number }>();
  for (const product of products) {
    for (const option of pick(product)) {
      const current = counts.get(option.slug);
      counts.set(option.slug, {
        ...option,
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  return counts;
}

export function queryCatalog(
  products: CatalogProductRecord[],
  filters: CatalogFilters,
): CatalogResult {
  const sort = filters.sort ?? 'featured';
  const tags = filters.tags ?? [];
  const normalized: CatalogFilters = { ...filters, tags, sort };

  const matching = products.filter((product) => passes(product, normalized));

  const categoryCounts = countFacet(
    products.filter((product) => passes(product, normalized, 'category')),
    (product) => [
      {
        slug: product.category.slug,
        name: product.category.name,
        iconKey: product.category.iconKey,
        description: product.category.description,
        displayOrder: product.category.displayOrder,
      },
    ],
  );
  const allCategories = new Map(
    products.map((product) => [product.category.slug, product.category]),
  );
  const categories = [...allCategories.values()]
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'es'),
    )
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      iconKey: category.iconKey,
      description: category.description,
      count: categoryCounts.get(category.slug)?.count ?? 0,
    }));

  const tagCounts = countFacet(
    products.filter((product) => passes(product, normalized, 'tags')),
    (product) =>
      product.tagAssignments.map((assignment) => ({
        slug: assignment.tag.slug,
        name: assignment.tag.name,
      })),
  );
  const allTags = new Map(
    products.flatMap((product) =>
      product.tagAssignments.map(
        (assignment) => [assignment.tag.slug, assignment.tag.name] as const,
      ),
    ),
  );
  const tagOptions = [...allTags.entries()]
    .map(([slug, name]) => ({
      slug,
      name,
      count: tagCounts.get(slug)?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

  const priced = products
    .filter((product) => passes(product, normalized, 'price'))
    .flatMap(prices);

  return {
    items: sortProducts(matching, sort).map(toProductCard),
    total: matching.length,
    facets: {
      categories,
      tags: tagOptions,
      price: {
        minPesos: priced.length > 0 ? Math.min(...priced) : null,
        maxPesos: priced.length > 0 ? Math.max(...priced) : null,
      },
    },
    applied: { ...filters, tags, sort },
  };
}

export function toProductDetail(
  product: CatalogProductRecord,
  catalog: CatalogProductRecord[],
): CatalogProductDetail {
  const tagSlugs = new Set(
    product.tagAssignments.map((assignment) => assignment.tag.slug),
  );
  const scored = catalog
    .filter((other) => other.id !== product.id)
    .map((other) => ({
      other,
      score:
        (other.category.slug === product.category.slug ? 2 : 0) +
        other.tagAssignments.filter((assignment) =>
          tagSlugs.has(assignment.tag.slug),
        ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.other.name.localeCompare(b.other.name, 'es'),
    );

  return {
    ...toProductCard(product),
    description: product.description,
    howToUse: product.howToUse,
    idealFor: product.idealFor,
    usageFrequency: product.usageFrequency,
    precautions: product.precautions,
    contentNeedsReview: product.contentNeedsReview,
    treatments: product.recommendations.map(({ treatment }) => ({
      name: treatment.name,
      slug: treatment.slug,
      tagline: treatment.tagline,
      categorySlug: treatment.category.slug,
      categoryName: treatment.category.name,
    })),
    related: scored
      .slice(0, RELATED_LIMIT)
      .map(({ other }) => toProductCard(other)),
  };
}
