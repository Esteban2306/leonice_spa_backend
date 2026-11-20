export const DEPOSIT_REMINDER_BEFORE_MS = 30 * 60_000;
export const DEPOSIT_REMINDER_MIN_NOTICE_MS = 30 * 60_000;

export function depositReminderAt(expiresAt: Date, now: Date): Date | null {
  const at = expiresAt.getTime() - DEPOSIT_REMINDER_BEFORE_MS;
  if (at - now.getTime() < DEPOSIT_REMINDER_MIN_NOTICE_MS) return null;
  return new Date(at);
}

export const depositReminderJobId = (reservationId: string, expiresAt: Date) =>
  `deposit-reminder-${reservationId}-${expiresAt.getTime()}`;

export function remindsForCombo<T extends { id: string; scheduledStart: Date }>(
  pending: readonly T[],
): T | null {
  return (
    [...pending].sort(
      (a, b) =>
        a.scheduledStart.getTime() - b.scheduledStart.getTime() ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}
