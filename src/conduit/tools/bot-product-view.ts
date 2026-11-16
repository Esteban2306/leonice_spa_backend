import type { CatalogProductRecord } from '../../products/catalog/product-catalog.repository';
import { computeRitualPricing } from '../../products/domain/ritual-pricing';

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

function pricingOf(ritual: CatalogProductRecord) {
  return computeRitualPricing(
    Math.min(...ritual.variants.map((variant) => Number(variant.price))),
    ritual.comboItems.map(({ quantity, variant }) => ({
      quantity,
      unitPrice: Number(variant.price),
    })),
  );
}

function ritualInfo(product: CatalogProductRecord): BotRitualInfo | null {
  if (product.kind !== 'COMBO') return null;
  const pricing = pricingOf(product);
  return {
    separatePrice: pricing.separatePricePesos,
    savings: pricing.savingsPesos,
    savingsPercent: pricing.savingsPercent,
    includes: product.comboItems.map(({ quantity, variant }) => ({
      name: variant.product.name,
      presentation: variant.presentation,
      quantity,
      unitPrice: Number(variant.price),
    })),
  };
}

function ritualsIncluding(
  product: CatalogProductRecord,
  catalog: CatalogProductRecord[],
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
      const pricing = pricingOf(ritual);
      return {
        name: ritual.name,
        price: pricing.pricePesos,
        savings: pricing.savingsPesos,
        savingsPercent: pricing.savingsPercent,
      };
    })
    .filter((offer) => offer.savings > 0);
}

function toItem(
  product: CatalogProductRecord,
  catalog: CatalogProductRecord[],
): BotProductItem {
  const prices = product.variants.map((variant) => Number(variant.price));
  const ritual = ritualInfo(product);
  const alsoInRituals = ritualsIncluding(product, catalog);
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
      })),
    purpose: product.purpose,
    description: product.description,
    benefits: product.benefits.slice(0, LIST_ITEMS),
    idealFor: product.idealFor.slice(0, LIST_ITEMS),
    howToUse: product.howToUse.slice(0, LIST_ITEMS),
    usageFrequency: product.usageFrequency,
    precautions: product.precautions.slice(0, LIST_ITEMS),
    recommendedForTreatments: treatmentNames(product),
    ritual,
    alsoInRituals,
    hint: ritual
      ? RITUAL_ITEM_HINT
      : alsoInRituals.length > 0
        ? ALSO_IN_RITUAL_HINT
        : null,
  };
}

export function toBotProducts(
  catalog: CatalogProductRecord[],
  query: string | undefined,
): BotProductsResult {
  const available = catalog.filter(sellable);
  const text = (query ?? '').trim();
  const tokens = tokensOf(text);

  let ranked: CatalogProductRecord[];
  if (!text) {
    ranked = available;
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
    .map((product) => toItem(product, available));
  return {
    status: 'found',
    total: ranked.length,
    shown: products.length,
    products,
    availabilityNote: PRODUCT_AVAILABILITY_NOTE,
  };
}
