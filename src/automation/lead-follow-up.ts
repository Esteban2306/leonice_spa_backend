export const LEAD_FOLLOW_UP_AFTER_MS = 20 * 60 * 60_000;
export const LEAD_FOLLOW_UP_WITHIN_MS = 3 * 24 * 60 * 60_000;
export const LEAD_FOLLOW_UP_BATCH = 20;

export function leadWindow(now: Date): { from: Date; until: Date } {
  return {
    from: new Date(now.getTime() - LEAD_FOLLOW_UP_WITHIN_MS),
    until: new Date(now.getTime() - LEAD_FOLLOW_UP_AFTER_MS),
  };
}

export function mutedPhones(
  rows: ReadonlyArray<{ address?: unknown }>,
): Set<string> {
  return new Set(
    rows
      .map((row) => (typeof row.address === 'string' ? row.address : ''))
      .filter((address) => /^\d+$/.test(address)),
  );
}

export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');
