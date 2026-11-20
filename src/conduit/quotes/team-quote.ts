export const TEAM_QUOTE_VALID_DAYS = 30;
export const TEAM_QUOTE_LOOKBACK_DAYS = 14;
export const MIN_QUOTE_COP = 10_000;
export const MAX_QUOTE_COP = 10_000_000;

const GROUPED = /\d{1,3}(?:[.,\s]\d{3})+/g;
const PLAIN = /\b\d{5,8}\b/g;
const THOUSANDS = /\b(\d{1,4})\s*(?:mil|k)\b/gi;

export function amountsInText(text: string): number[] {
  const found = new Set<number>();
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(THOUSANDS)) {
    found.add(Number(match[1]) * 1000);
  }
  for (const match of lower.matchAll(GROUPED)) {
    found.add(Number(match[0].replace(/[.,\s]/g, '')));
  }
  for (const match of lower.matchAll(PLAIN)) {
    found.add(Number(match[0]));
  }
  return [...found].filter(
    (value) => value >= MIN_QUOTE_COP && value <= MAX_QUOTE_COP,
  );
}

export interface PricedTreatment {
  basePriceMin: unknown;
  basePriceMax: unknown;
  hasHairVariablePricing: boolean;
  requiresPriorAssessment: boolean;
  hairLengthPricing: Array<{ price: unknown }>;
  hairColorSurcharges: Array<{ surcharge: unknown }>;
}

const money = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function quoteBounds(
  treatment: PricedTreatment,
): { min: number; max: number } | null {
  const lengthPrices = treatment.hasHairVariablePricing
    ? treatment.hairLengthPricing
        .map((p) => money(p.price))
        .filter((n): n is number => n !== null)
    : [];
  const surcharge = treatment.hasHairVariablePricing
    ? Math.max(
        0,
        ...treatment.hairColorSurcharges.map((s) => money(s.surcharge) ?? 0),
      )
    : 0;
  const candidates = [
    money(treatment.basePriceMin),
    money(treatment.basePriceMax),
    ...lengthPrices,
  ].filter((n): n is number => n !== null);
  if (candidates.length === 0) return null;
  const min = Math.min(...candidates);
  const max = Math.max(...candidates) + surcharge;
  const variable =
    treatment.hasHairVariablePricing ||
    treatment.requiresPriorAssessment ||
    max > min;
  return variable ? { min, max } : null;
}

export type QuoteCheck =
  | { ok: true }
  | { ok: false; reason: 'FIXED_PRICE' | 'OUT_OF_RANGE' | 'NOT_IN_CHAT' };

export function checkTeamQuote(params: {
  amount: number;
  treatment: PricedTreatment;
  teamMessages: readonly string[];
}): QuoteCheck {
  const bounds = quoteBounds(params.treatment);
  if (!bounds) return { ok: false, reason: 'FIXED_PRICE' };
  if (params.amount < bounds.min || params.amount > bounds.max) {
    return { ok: false, reason: 'OUT_OF_RANGE' };
  }
  const said = params.teamMessages.some((text) =>
    amountsInText(text).includes(params.amount),
  );
  return said ? { ok: true } : { ok: false, reason: 'NOT_IN_CHAT' };
}
