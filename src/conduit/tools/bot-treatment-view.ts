import { combineHairPricing } from '../../clients/domain/compute-treatment-pricing';
import { isHairProfileValid } from '../../clients/domain/hair-profile.util';
import { applyPercentageDiscount } from '../../common/money/percentage-discount';
import type { HairColor, HairLength } from '@prisma/client';

export interface BotPricingClient {
  hairLength: HairLength | null;
  hairColor: HairColor | null;
  hairProfileUpdatedAt: Date | null;
}

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
  hairLengthPricing?: Array<{
    hairLength: HairLength;
    price: unknown;
    durationMinutes: number;
  }>;
  hairColorSurcharges?: Array<{
    hairColor: HairColor;
    surcharge: unknown;
    extraDurationMinutes: number;
  }>;
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

function personalizedPricing(
  treatment: BotTreatmentSource,
  client: BotPricingClient | null | undefined,
): { price: number; durationMinutes: number } | null {
  if (
    !client ||
    !treatment.hasHairVariablePricing ||
    !treatment.hairLengthPricing?.length ||
    !isHairProfileValid(client)
  ) {
    return null;
  }
  try {
    return combineHairPricing(
      treatment.hairLengthPricing as never,
      (treatment.hairColorSurcharges ?? []) as never,
      client.hairLength!,
      client.hairColor!,
    );
  } catch {
    return null;
  }
}

export function toBotTreatment(
  treatment: BotTreatmentSource,
  client?: BotPricingClient | null,
) {
  const promotion = treatment.activePromotion;
  const personal = personalizedPricing(treatment, client);
  const rangePrice = formatPriceRange(
    treatment.basePriceMin,
    treatment.basePriceMax,
  );
  const promotionRange = formatPriceRange(
    treatment.effectiveBasePriceMin,
    treatment.effectiveBasePriceMax,
  );
  const promotionPrice = personal
    ? formatCop(
        applyPercentageDiscount(
          personal.price,
          Number(promotion?.discountPercentage ?? 0),
        ),
      )
    : promotionRange;
  const price = personal ? formatCop(personal.price) : rangePrice;

  return {
    id: treatment.id,
    name: treatment.name,
    category: treatment.category?.name ?? null,
    ...(treatment.tagline && { tagline: treatment.tagline }),
    price,
    ...(personal
      ? { personalizedPrice: true }
      : price?.includes('–') && { priceIsRange: true }),
    duration: personal
      ? formatDurationRange(personal.durationMinutes, personal.durationMinutes)
      : formatDurationRange(
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
  };
}
