const DAY_MS = 86_400_000;

export const DEFAULT_MARKETING_COOLDOWN_DAYS = 30;
export const MAX_MARKETING_COOLDOWN_DAYS = 365;

export function blockedUntil(
  lastContactAt: Date | null,
  cooldownDays: number,
  now: Date,
): Date | null {
  if (!lastContactAt || cooldownDays <= 0) return null;
  const until = new Date(lastContactAt.getTime() + cooldownDays * DAY_MS);
  return until.getTime() > now.getTime() ? until : null;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'long',
});

export const cooldownReason = (until: Date): string =>
  `Recibió otro mensaje de marketing; puede recibir otro desde el ${DATE_FORMAT.format(until)}`;
