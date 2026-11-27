import { MAX_PRICE_COP } from '../../common/money/price-units';

export const TEAM_QUOTE_VALID_DAYS = 30;
export const TEAM_QUOTE_LOOKBACK_DAYS = 14;
export const MIN_QUOTE_COP = 10_000;
export const MAX_QUOTE_COP = MAX_PRICE_COP;

const GROUPED = /\d{1,3}(?:[.,\s]\d{3})+/g;
const PLAIN = /\b\d{5,8}\b/g;
const THOUSANDS = /\b(\d{1,4})\s*(?:mil|k)\b/gi;
const SHORTHAND =
  /(?<![\d:/.,$])(?<!\blas\s)(?<!\bel\s)(?<!\bde\s)\b(\d{2,4})\b(?![:/.,]\d|\s*(?:mil|k|h|hrs?|horas?|min|minutos?|a\.?\s?m|p\.?\s?m|de\s))/gi;

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
  for (const match of lower.matchAll(SHORTHAND)) {
    found.add(Number(match[1]) * 1000);
  }
  return [...found].filter(
    (value) => value >= MIN_QUOTE_COP && value <= MAX_QUOTE_COP,
  );
}

export type QuoteCheck = { ok: true } | { ok: false; reason: 'NOT_IN_CHAT' };

export function checkTeamQuote(params: {
  amount: number;
  teamMessages: readonly string[];
}): QuoteCheck {
  const said = params.teamMessages.some((text) =>
    amountsInText(text).includes(params.amount),
  );
  return said ? { ok: true } : { ok: false, reason: 'NOT_IN_CHAT' };
}
