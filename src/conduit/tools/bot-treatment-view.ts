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

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const formatCop = (thousands: number): string =>
  `$${Math.round(thousands * 1000).toLocaleString('es-CO')}`;

export function formatPriceRange(min: unknown, max: unknown): string | null {
  const low = toNumber(min);
  const high = toNumber(max) ?? low;
  if (low === null || high === null) return null;
  return low === high
    ? formatCop(low)
    : `${formatCop(low)} – ${formatCop(high)}`;
}

const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export function formatDurationRange(
  min: number | null,
  max: number | null,
): string | null {
  const low = min ?? max;
  const high = max ?? min;
  if (low === null || high === null) return null;
  if (low === high) return formatMinutes(low);
  const bothWholeHours = low % 60 === 0 && high % 60 === 0;
  return bothWholeHours
    ? `${low / 60} a ${high / 60} h`
    : `${formatMinutes(low)} a ${formatMinutes(high)}`;
}

export function toBotTreatment(treatment: BotTreatmentSource) {
  const promotion = treatment.activePromotion;
  const promotionPrice = formatPriceRange(
    treatment.effectiveBasePriceMin,
    treatment.effectiveBasePriceMax,
  );

  return {
    id: treatment.id,
    name: treatment.name,
    category: treatment.category?.name ?? null,
    ...(treatment.tagline && { tagline: treatment.tagline }),
    price: formatPriceRange(treatment.basePriceMin, treatment.basePriceMax),
    duration: formatDurationRange(
      treatment.baseDurationMinMinutes,
      treatment.baseDurationMaxMinutes,
    ),
    ...(treatment.requiresPriorAssessment && { requiresAssessment: true }),
    ...(promotion && {
      promotion: {
        name: promotion.name,
        discount: `${promotion.discountPercentage} %`,
        ...(promotionPrice && { price: promotionPrice }),
      },
    }),
    ...(treatment.hasHairVariablePricing && {
      priceDependsOnHair: true,
      hairLengthPricing: treatment.hairLengthPricing,
      hairColorSurcharges: treatment.hairColorSurcharges,
    }),
  };
}
