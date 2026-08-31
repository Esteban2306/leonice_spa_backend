import {
  HairColor,
  HairLength,
  Treatment,
  TreatmentHairColorSurcharge,
  TreatmentHairLengthPricing,
  Client,
} from '@prisma/client';
import { isHairProfileValid } from 'src/clients/domain/hair-profile.util';

export interface PricingResult {
  price: number;
  durationMinutes: number;
  forcesAssessment: boolean;
  needsHairProfile: boolean;
}

type TreatmentWithHairPricing = Treatment & {
  hairLengthPricing: TreatmentHairLengthPricing[];
  hairColorSurcharges: TreatmentHairColorSurcharge[];
};

function findColorSurcharge(
  rows: TreatmentHairColorSurcharge[],
  color: HairColor,
) {
  const row = rows.find((r) => r.hairColor === color);
  return row
    ? {
        surcharge: Number(row.surcharge),
        extraDuration: row.extraDurationMinutes,
      }
    : { surcharge: 0, extraDuration: 0 };
}

function exactHairPricing(
  treatment: TreatmentWithHairPricing,
  length: HairLength,
  color: HairColor,
) {
  const lengthRow = treatment.hairLengthPricing.find(
    (r) => r.hairLength === length,
  );
  if (!lengthRow)
    throw new Error(
      `Falta el precio configurado para cabello ${length} en "${treatment.name}"`,
    );

  const { surcharge, extraDuration } = findColorSurcharge(
    treatment.hairColorSurcharges,
    color,
  );
  return {
    price: Number(lengthRow.price) + surcharge,
    durationMinutes: lengthRow.durationMinutes + extraDuration,
  };
}

function worstCaseHairPricing(treatment: TreatmentWithHairPricing) {
  const worstLength = treatment.hairLengthPricing.reduce(
    (worst, r) => ({
      price: Math.max(worst.price, Number(r.price)),
      durationMinutes: Math.max(worst.durationMinutes, r.durationMinutes),
    }),
    { price: 0, durationMinutes: 0 },
  );
  const worstColorSurcharge = treatment.hairColorSurcharges.reduce(
    (worst, r) => ({
      surcharge: Math.max(worst.surcharge, Number(r.surcharge)),
      extraDuration: Math.max(worst.extraDuration, r.extraDurationMinutes),
    }),
    { surcharge: 0, extraDuration: 0 },
  );
  return {
    price: worstLength.price + worstColorSurcharge.surcharge,
    durationMinutes:
      worstLength.durationMinutes + worstColorSurcharge.extraDuration,
  };
}

export function determineTreatmentPricing(
  treatment: TreatmentWithHairPricing,
  client: Pick<Client, 'hairLength' | 'hairColor' | 'hairProfileUpdatedAt'>,
): PricingResult {
  if (
    !treatment.hasHairVariablePricing ||
    treatment.hairLengthPricing.length === 0
  ) {
    const requiresAssessment = treatment.requiresPriorAssessment;
    return {
      price: Number(
        requiresAssessment
          ? (treatment.basePriceMax ?? 0)
          : (treatment.basePriceMin ?? 0),
      ),
      durationMinutes: requiresAssessment
        ? (treatment.baseDurationMaxMinutes ?? 60)
        : (treatment.baseDurationMinMinutes ??
          treatment.baseDurationMaxMinutes ??
          60),
      forcesAssessment: false,
      needsHairProfile: false,
    };
  }

  if (!isHairProfileValid(client)) {
    return {
      ...worstCaseHairPricing(treatment),
      forcesAssessment: true,
      needsHairProfile: true,
    };
  }

  return {
    ...exactHairPricing(treatment, client.hairLength!, client.hairColor!),
    forcesAssessment: treatment.requiresPriorAssessment,
    needsHairProfile: false,
  };
}
