export const OWNER_RECIPIENT_NAME = 'leo';

const normalizeName = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const OWNER_PATTERN = new RegExp(
  `(?:^|[^a-z0-9])${OWNER_RECIPIENT_NAME}(?:$|[^a-z0-9])`,
);

export function ownerRecipients<T extends { name: string }>(
  recipients: readonly T[],
): T[] {
  return recipients.filter((recipient) =>
    OWNER_PATTERN.test(normalizeName(recipient.name)),
  );
}
