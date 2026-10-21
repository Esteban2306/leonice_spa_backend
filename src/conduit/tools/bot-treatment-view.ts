interface BotTreatmentSource {
  id: string;
  name: string;
  categoryId: string;
  tagline: string | null;
  requiresPriorAssessment: boolean;
  hasHairVariablePricing: boolean;
  basePriceMin: unknown;
  basePriceMax: unknown;
  baseDurationMinMinutes: number | null;
  baseDurationMaxMinutes: number | null;
  category?: { name: string } | null;
  activePromotion?: {
    id: string;
    name: string;
    discountPercentage: string;
  } | null;
  effectiveBasePriceMin?: number | null;
  effectiveBasePriceMax?: number | null;
  hairLengthPricing?: unknown[];
  hairColorSurcharges?: unknown[];
}

export function toBotTreatment(treatment: BotTreatmentSource) {
  return {
    id: treatment.id,
    name: treatment.name,
    categoryId: treatment.categoryId,
    category: treatment.category?.name ?? null,
    tagline: treatment.tagline,
    requiresPriorAssessment: treatment.requiresPriorAssessment,
    hasHairVariablePricing: treatment.hasHairVariablePricing,
    basePriceMin: treatment.basePriceMin,
    basePriceMax: treatment.basePriceMax,
    baseDurationMinMinutes: treatment.baseDurationMinMinutes,
    baseDurationMaxMinutes: treatment.baseDurationMaxMinutes,
    activePromotion: treatment.activePromotion ?? null,
    ...(treatment.effectiveBasePriceMin !== undefined && {
      effectiveBasePriceMin: treatment.effectiveBasePriceMin,
      effectiveBasePriceMax: treatment.effectiveBasePriceMax,
    }),
    ...(treatment.hasHairVariablePricing && {
      hairLengthPricing: treatment.hairLengthPricing,
      hairColorSurcharges: treatment.hairColorSurcharges,
    }),
  };
}
