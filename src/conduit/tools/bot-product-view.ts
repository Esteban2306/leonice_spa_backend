import type { CatalogProductRecord } from '../../products/catalog/product-catalog.repository';
import { computeRitualPricing } from '../../products/domain/ritual-pricing';
import {
  discountedPesos,
  productPromotionFor,
  ProductPromotionPrice,
  ProductPromotionSource,
} from '../../products/domain/product-promotion';
import { formatPromotionEnd } from './bot-treatment-view';

export const BOT_PRODUCTS_LIMIT = 5;
const VARIANTS_PER_PRODUCT = 6;
const LIST_ITEMS = 4;
const MIN_TOKEN_LENGTH = 3;
const STOPWORDS = new Set([
  'que',
  'con',
  'para',
  'por',
  'los',
  'las',
  'del',
  'una',
  'uno',
  'unos',
  'unas',
  'hay',
  'tiene',
  'tienen',
  'tienes',
  'cuanto',
  'cuesta',
  'vale',
  'precio',
  'quiero',
  'saber',
  'producto',
  'productos',
  'recomiendan',
  'recomienda',
]);

export const PRODUCT_AVAILABILITY_NOTE =
  'El sistema no lleva inventario: "disponible" significa que está en el catálogo del spa, no que haya unidades. No prometas existencias; la cantidad exacta la confirma el equipo.';

export interface BotProductVariant {
  brand: string;
  presentation: string;
  price: number;
  promoPrice?: number;
}

export interface BotProductPromotion {
  name: string;
  discount: string;
  priceFrom: number;
  priceTo: number;
  validUntil: string;
}

export interface BotRitualInfo {
  separatePrice: number;
  savings: number;
  savingsPercent: number;
  includes: {
    name: string;
    presentation: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export interface BotRitualOffer {
  name: string;
  price: number;
  savings: number;
  savingsPercent: number;
}

export const RITUAL_ITEM_HINT =
  'Es un Ritual: un combo con precio especial. Cuéntale qué incluye y cuánto ahorra frente a comprar cada producto por separado.';

export const PROMOTION_HINT =
  'Tiene promoción vigente: dile el precio normal, el descuento, el precio con promoción (promoPrice) y hasta cuándo, una sola vez y sin presionar. Si lo quiere comprar, pon el precio con promoción en la solicitud.';

export const ALSO_IN_RITUAL_HINT =
  'Este producto también viene en un Ritual con precio especial. Después de responder lo que preguntó, menciónale una sola vez el Ritual, su precio y el ahorro; no insistas.';

export interface BotProductItem {
  type: 'producto' | 'ritual';
  name: string;
  category: string;
  tagline: string | null;
  availability: 'IN_CATALOG';
  priceFrom: number;
  priceTo: number;
  variants: BotProductVariant[];
  purpose: string | null;
  description: string | null;
  benefits: string[];
  idealFor: string[];
  howToUse: string[];
  usageFrequency: string | null;
  precautions: string[];
  recommendedForTreatments: string[];
  promotion: BotProductPromotion | null;
  ritual: BotRitualInfo | null;
  alsoInRituals: BotRitualOffer[];
  hint: string | null;
}

export type BotProductsResult =
  | {
      status: 'found';
      total: number;
      shown: number;
      products: BotProductItem[];
      availabilityNote: string;
    }
  | { status: 'not_found'; availabilityNote: string };

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function tokensOf(query: string): string[] {
  return [
    ...new Set(
      normalize(query)
        .split(/[^a-z0-9ñ]+/)
        .filter(
          (word) => word.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(word),
        ),
    ),
  ];
}

function treatmentNames(product: CatalogProductRecord): string[] {
  return product.recommendations.map((entry) => entry.treatment.name);
}

function haystackOf(product: CatalogProductRecord): string {
  return normalize(
    [
      product.name,
      product.tagline,
      product.purpose,
      product.category.name,
      ...product.benefits,
      ...product.idealFor,
      ...treatmentNames(product),
      ...product.tagAssignments.map((assignment) => assignment.tag.name),
      ...product.variants.flatMap((variant) => [
        variant.brand,
        variant.presentation,
      ]),
      ...product.comboItems.map(({ variant }) => variant.product.name),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' '),
  );
}

function sellable(product: CatalogProductRecord): boolean {
  return product.variants.length > 0;
}

function priceWith(price: number, promotion: ProductPromotionPrice | null) {
  return promotion
    ? discountedPesos(price, promotion.discountPercentage)
    : price;
}

function componentPrice(
  variant: CatalogProductRecord['comboItems'][number]['variant'],
  promotions: readonly ProductPromotionSource[],
) {
  return priceWith(
    Number(variant.price),
    productPromotionFor(promotions, {
      id: variant.product.id,
      productCategoryId: variant.product.productCategoryId ?? '',
    }),
  );
}

function pricingOf(
  ritual: CatalogProductRecord,
  promotions: readonly ProductPromotionSource[],
) {
  return computeRitualPricing(
    priceWith(
      Math.min(...ritual.variants.map((variant) => Number(variant.price))),
      productPromotionFor(promotions, ritual),
    ),
    ritual.comboItems.map(({ quantity, variant }) => ({
      quantity,
      unitPrice: componentPrice(variant, promotions),
    })),
  );
}

function ritualInfo(
  product: CatalogProductRecord,
  promotions: readonly ProductPromotionSource[],
): BotRitualInfo | null {
  if (product.kind !== 'COMBO') return null;
  const pricing = pricingOf(product, promotions);
  return {
    separatePrice: pricing.separatePricePesos,
    savings: pricing.savingsPesos,
    savingsPercent: pricing.savingsPercent,
    includes: product.comboItems.map(({ quantity, variant }) => ({
      name: variant.product.name,
      presentation: variant.presentation,
      quantity,
      unitPrice: componentPrice(variant, promotions),
    })),
  };
}

function ritualsIncluding(
  product: CatalogProductRecord,
  catalog: CatalogProductRecord[],
  promotions: readonly ProductPromotionSource[],
): BotRitualOffer[] {
  if (product.kind === 'COMBO') return [];
  return catalog
    .filter(
      (other) =>
        other.kind === 'COMBO' &&
        sellable(other) &&
        other.comboItems.some(
          ({ variant }) => variant.product.id === product.id,
        ),
    )
    .map((ritual) => {
      const pricing = pricingOf(ritual, promotions);
      return {
        name: ritual.name,
        price: pricing.pricePesos,
        savings: pricing.savingsPesos,
        savingsPercent: pricing.savingsPercent,
      };
    })
    .filter((offer) => offer.savings > 0);
}

function promotionView(
  promotion: ProductPromotionPrice | null,
  prices: number[],
): BotProductPromotion | null {
  if (!promotion) return null;
  const discounted = prices.map((price) => priceWith(price, promotion));
  return {
    name: promotion.name,
    discount: `${promotion.discountPercentage} %`,
    priceFrom: Math.min(...discounted),
    priceTo: Math.max(...discounted),
    validUntil: formatPromotionEnd(promotion.endsAt),
  };
}

function hintFor(
  promotion: BotProductPromotion | null,
  ritual: BotRitualInfo | null,
  alsoInRituals: BotRitualOffer[],
): string | null {
  const hints = [
    promotion ? PROMOTION_HINT : null,
    ritual
      ? ritual.savings > 0
        ? RITUAL_ITEM_HINT
        : null
      : alsoInRituals.length > 0
        ? ALSO_IN_RITUAL_HINT
        : null,
  ].filter((hint): hint is string => hint !== null);
  return hints.length > 0 ? hints.join(' ') : null;
}

function toItem(
  product: CatalogProductRecord,
  catalog: CatalogProductRecord[],
  promotions: readonly ProductPromotionSource[],
): BotProductItem {
  const prices = product.variants.map((variant) => Number(variant.price));
  const active = productPromotionFor(promotions, product);
  const promotion = promotionView(active, prices);
  const ritual = ritualInfo(product, promotions);
  const alsoInRituals = ritualsIncluding(product, catalog, promotions);
  return {
    type: ritual ? 'ritual' : 'producto',
    name: product.name,
    category: product.category.name,
    tagline: product.tagline,
    availability: 'IN_CATALOG',
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    variants: product.variants
      .slice(0, VARIANTS_PER_PRODUCT)
      .map((variant) => ({
        brand: variant.brand,
        presentation: variant.presentation,
        price: Number(variant.price),
        ...(active && {
          promoPrice: priceWith(Number(variant.price), active),
        }),
      })),
    purpose: product.purpose,
    description: product.description,
    benefits: product.benefits.slice(0, LIST_ITEMS),
    idealFor: product.idealFor.slice(0, LIST_ITEMS),
    howToUse: product.howToUse.slice(0, LIST_ITEMS),
    usageFrequency: product.usageFrequency,
    precautions: product.precautions.slice(0, LIST_ITEMS),
    recommendedForTreatments: treatmentNames(product),
    promotion,
    ritual,
    alsoInRituals,
    hint: hintFor(promotion, ritual, alsoInRituals),
  };
}

export function toBotProducts(
  catalog: CatalogProductRecord[],
  query: string | undefined,
  promotions: readonly ProductPromotionSource[] = [],
): BotProductsResult {
  const available = catalog.filter(sellable);
  const text = (query ?? '').trim();
  const tokens = tokensOf(text);

  let ranked: CatalogProductRecord[];
  if (!text) {
    const promoted = (product: CatalogProductRecord) =>
      productPromotionFor(promotions, product) ? 1 : 0;
    ranked = [...available].sort((a, b) => promoted(b) - promoted(a));
  } else if (tokens.length === 0) {
    ranked = [];
  } else {
    ranked = available
      .map((product) => {
        const haystack = haystackOf(product);
        const name = normalize(product.name);
        return {
          product,
          score: tokens.filter((token) => haystack.includes(token)).length,
          inName: tokens.filter((token) => name.includes(token)).length,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.inName - a.inName)
      .map((entry) => entry.product);
  }

  if (ranked.length === 0) {
    return { status: 'not_found', availabilityNote: PRODUCT_AVAILABILITY_NOTE };
  }
  const products = ranked
    .slice(0, BOT_PRODUCTS_LIMIT)
    .map((product) => toItem(product, available, promotions));
  return {
    status: 'found',
    total: ranked.length,
    shown: products.length,
    products,
    availabilityNote: PRODUCT_AVAILABILITY_NOTE,
  };
}

export function promotedProducts(
  catalog: CatalogProductRecord[],
  promotions: readonly ProductPromotionSource[],
): BotProductItem[] {
  const available = catalog.filter(sellable);
  return available
    .filter((product) => productPromotionFor(promotions, product) !== null)
    .map((product) => toItem(product, available, promotions));
}
