import { Promotion } from '@prisma/client';
import { resolveApplicablePromotion } from 'src/promotions/domain/resolve-applicable-promotion';
import type {
  ShowcaseCategoryRecord,
  ShowcaseTreatmentRecord,
} from './showcase.repository';

export interface ShowcasePrice {
  fromThousands: number | null;
  toThousands: number | null;
  promotion: {
    name: string;
    discountPercentage: number;
    fromThousands: number | null;
    toThousands: number | null;
  } | null;
}

export interface ShowcaseTreatmentCard {
  id: string;
  slug: string;
  categorySlug: string;
  categoryName: string;
  name: string;
  tagline: string | null;
  summary: string | null;
  requiresPriorAssessment: boolean;
  price: ShowcasePrice;
  durationMinMinutes: number | null;
  durationMaxMinutes: number | null;
  videoUrl: string | null;
  posterUrl: string | null;
  benefits: string[];
  stepCount: number;
}

export interface ShowcaseStep {
  position: number;
  title: string;
  description: string;
  durationMinutes: number | null;
}

export interface ShowcaseTreatmentDetail extends ShowcaseTreatmentCard {
  idealFor: string[];
  results: string | null;
  aftercare: string[];
  considerations: string[];
  recommendedFrequency: string | null;
  steps: ShowcaseStep[];
  category: ShowcaseCategorySummary;
  related: ShowcaseTreatmentCard[];
}

export interface ShowcaseCategorySummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  iconKey: string | null;
  treatmentCount: number;
  priceFromThousands: number | null;
  durationMinMinutes: number | null;
  durationMaxMinutes: number | null;
  posterUrl: string | null;
  hasPromotion: boolean;
}

export interface ShowcaseCategoryDetail extends ShowcaseCategorySummary {
  treatments: ShowcaseTreatmentCard[];
}

const RELATED_LIMIT = 3;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function discounted(value: number | null, percentage: number): number | null {
  if (value === null) return null;
  return Number((value * (1 - percentage / 100)).toFixed(2));
}

function minOf(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.min(...present) : null;
}

function maxOf(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

export function toShowcasePrice(
  treatment: ShowcaseTreatmentRecord,
  promotions: Promotion[],
): ShowcasePrice {
  const fromThousands = toNumber(treatment.basePriceMin);
  const toThousands = toNumber(treatment.basePriceMax) ?? fromThousands;
  const promo = resolveApplicablePromotion(promotions, {
    treatmentId: treatment.id,
    categoryId: treatment.categoryId,
  });
  if (!promo) return { fromThousands, toThousands, promotion: null };

  const discountPercentage = Number(promo.discountPercentage);
  return {
    fromThousands,
    toThousands,
    promotion: {
      name: promo.name,
      discountPercentage,
      fromThousands: discounted(fromThousands, discountPercentage),
      toThousands: discounted(toThousands, discountPercentage),
    },
  };
}

export function toTreatmentCard(
  category: ShowcaseCategoryRecord,
  treatment: ShowcaseTreatmentRecord,
  promotions: Promotion[],
): ShowcaseTreatmentCard {
  return {
    id: treatment.id,
    slug: treatment.slug,
    categorySlug: category.slug,
    categoryName: category.name,
    name: treatment.name,
    tagline: treatment.tagline,
    summary: treatment.summary,
    requiresPriorAssessment: treatment.requiresPriorAssessment,
    price: toShowcasePrice(treatment, promotions),
    durationMinMinutes:
      treatment.baseDurationMinMinutes ?? treatment.baseDurationMaxMinutes,
    durationMaxMinutes:
      treatment.baseDurationMaxMinutes ?? treatment.baseDurationMinMinutes,
    videoUrl: treatment.videoUrl,
    posterUrl: treatment.posterUrl,
    benefits: treatment.benefits,
    stepCount: treatment.steps.length,
  };
}

export function toCategorySummary(
  category: ShowcaseCategoryRecord,
  promotions: Promotion[],
): ShowcaseCategorySummary {
  const cards = category.treatments.map((treatment) =>
    toTreatmentCard(category, treatment, promotions),
  );
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    tagline: category.tagline,
    description: category.description,
    iconKey: category.iconKey,
    treatmentCount: cards.length,
    priceFromThousands: minOf(
      cards.map(
        (card) =>
          card.price.promotion?.fromThousands ?? card.price.fromThousands,
      ),
    ),
    durationMinMinutes: minOf(cards.map((card) => card.durationMinMinutes)),
    durationMaxMinutes: maxOf(cards.map((card) => card.durationMaxMinutes)),
    posterUrl: cards.find((card) => card.posterUrl)?.posterUrl ?? null,
    hasPromotion: cards.some((card) => card.price.promotion !== null),
  };
}

export function toCategoryDetail(
  category: ShowcaseCategoryRecord,
  promotions: Promotion[],
): ShowcaseCategoryDetail {
  return {
    ...toCategorySummary(category, promotions),
    treatments: category.treatments.map((treatment) =>
      toTreatmentCard(category, treatment, promotions),
    ),
  };
}

export function toTreatmentDetail(
  category: ShowcaseCategoryRecord,
  treatment: ShowcaseTreatmentRecord,
  promotions: Promotion[],
): ShowcaseTreatmentDetail {
  return {
    ...toTreatmentCard(category, treatment, promotions),
    idealFor: treatment.idealFor,
    results: treatment.results,
    aftercare: treatment.aftercare,
    considerations: treatment.considerations,
    recommendedFrequency: treatment.recommendedFrequency,
    steps: treatment.steps.map((step) => ({
      position: step.position,
      title: step.title,
      description: step.description,
      durationMinutes: step.durationMinutes,
    })),
    category: toCategorySummary(category, promotions),
    related: category.treatments
      .filter((other) => other.id !== treatment.id)
      .slice(0, RELATED_LIMIT)
      .map((other) => toTreatmentCard(category, other, promotions)),
  };
}

export function hasVisibleTreatments(category: ShowcaseCategoryRecord) {
  return category.treatments.length > 0;
}
