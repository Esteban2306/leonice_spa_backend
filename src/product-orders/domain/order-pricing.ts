import {
  discountedPesos,
  productPromotionFor,
  ProductPromotionSource,
} from '../../products/domain/product-promotion';

export const MAX_ORDER_ITEMS = 10;
export const MAX_ITEM_QUANTITY = 20;

export interface CatalogVariant {
  id: string;
  brand: string;
  presentation: string;
  price: unknown;
}

export interface CatalogProduct {
  id: string;
  name: string;
  productCategoryId: string;
  variants: readonly CatalogVariant[];
}

export interface RequestedItem {
  product: string;
  presentation?: string | null;
  quantity: number;
}

export interface PricedItem {
  variantId: string | null;
  productName: string;
  presentation: string | null;
  quantity: number;
  unitPrice: number | null;
  promoPrice: number | null;
  promotion: string | null;
  promotionEndsAt: Date | null;
  missing: 'PRODUCT' | 'PRESENTATION' | null;
  options: string[];
}

export interface PricedOrder {
  items: PricedItem[];
  total: number | null;
}

const COMBINING_MARKS = /\p{M}/gu;
const NON_WORD = /[^a-z0-9]+/g;
const AMBIGUITY_MARGIN = 0.15;
const SYNONYMS: Record<string, string> = { kit: 'ritual', kits: 'ritual' };

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_WORD, ' ')
    .trim();
}

const words = (value: string) =>
  normalize(value)
    .split(' ')
    .filter((word) => word.length > 1)
    .map((word) => SYNONYMS[word] ?? word);

function score(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q) return 0;
  if (q === n) return 1;
  const queryWords = new Set(words(query));
  const nameWords = new Set(words(name));
  if (queryWords.size === 0) return 0;
  let shared = 0;
  for (const word of queryWords) if (nameWords.has(word)) shared++;
  const coverage = shared / queryWords.size;
  const precision = shared / nameWords.size;
  return coverage === 1 ? 0.5 + precision * 0.4 : coverage * 0.5;
}

export function coreName(query: string): string {
  return query
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;$]|\s[-–]\s/)[0]
    .trim();
}

export function findProduct<P extends CatalogProduct>(
  catalog: readonly P[],
  query: string,
): P | null {
  const core = coreName(query);
  return (
    rankProduct(catalog, query) ??
    (core && core !== query.trim() ? rankProduct(catalog, core) : null)
  );
}

function rankProduct<P extends CatalogProduct>(
  catalog: readonly P[],
  query: string,
): P | null {
  const ranked = catalog
    .map((product) => ({ product, score: score(query, product.name) }))
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < AMBIGUITY_MARGIN)
    return null;
  return ranked[0].product;
}

function findVariant(
  variants: readonly CatalogVariant[],
  presentation: string | null | undefined,
): CatalogVariant | null {
  if (variants.length === 1) return variants[0];
  if (!presentation) return null;
  const wanted = normalize(presentation).replace(/\s+/g, '');
  const matches = variants.filter((variant) => {
    const own = normalize(variant.presentation).replace(/\s+/g, '');
    const withBrand = normalize(
      `${variant.presentation} ${variant.brand}`,
    ).replace(/\s+/g, '');
    return own === wanted || withBrand.includes(wanted) || wanted.includes(own);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function priceOrder(
  catalog: readonly CatalogProduct[],
  promotions: readonly ProductPromotionSource[],
  requested: readonly RequestedItem[],
): PricedOrder {
  const items = requested
    .slice(0, MAX_ORDER_ITEMS)
    .map((wanted): PricedItem => {
      const quantity = Math.min(
        Math.max(Math.trunc(wanted.quantity) || 1, 1),
        MAX_ITEM_QUANTITY,
      );
      const product = findProduct(catalog, wanted.product);
      if (!product) {
        return {
          variantId: null,
          productName: wanted.product.trim(),
          presentation: wanted.presentation?.trim() || null,
          quantity,
          unitPrice: null,
          promoPrice: null,
          promotion: null,
          promotionEndsAt: null,
          missing: 'PRODUCT',
          options: [],
        };
      }
      const variant = findVariant(product.variants, wanted.presentation);
      if (!variant) {
        return {
          variantId: null,
          productName: product.name,
          presentation: wanted.presentation?.trim() || null,
          quantity,
          unitPrice: null,
          promoPrice: null,
          promotion: null,
          promotionEndsAt: null,
          missing: 'PRESENTATION',
          options: product.variants.map((v) => v.presentation),
        };
      }
      const unitPrice = Number(variant.price);
      const promotion = productPromotionFor(promotions, product);
      return {
        variantId: variant.id,
        productName: product.name,
        presentation: variant.presentation,
        quantity,
        unitPrice,
        promoPrice: promotion
          ? discountedPesos(unitPrice, promotion.discountPercentage)
          : null,
        promotion: promotion?.name ?? null,
        promotionEndsAt: promotion ? new Date(promotion.endsAt) : null,
        missing: null,
        options: [],
      };
    });
  const complete = items.length > 0 && items.every((item) => !item.missing);
  const total = complete
    ? items.reduce(
        (sum, item) =>
          sum + (item.promoPrice ?? (item.unitPrice as number)) * item.quantity,
        0,
      )
    : null;
  return { items, total };
}

export function orderCode(number: number): string {
  return `P-${String(number).padStart(4, '0')}`;
}

export function parseOrderCode(code: string | null | undefined): number | null {
  const match = /^\s*P-?0*(\d{1,9})\s*$/i.exec(code ?? '');
  return match ? Number(match[1]) : null;
}

export function priceHeldUntil(
  items: readonly Pick<PricedItem, 'promotionEndsAt'>[],
): Date | null {
  const ends = items
    .map((item) => item.promotionEndsAt?.getTime())
    .filter((time): time is number => typeof time === 'number');
  return ends.length > 0 ? new Date(Math.min(...ends)) : null;
}
