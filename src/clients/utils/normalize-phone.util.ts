export function normalizePhone(rawPhone: string): string {
  const digitsOnly = rawPhone.replace(/\D/g, '');

  if (digitsOnly.length === 10) {
    return `+57${digitsOnly}`;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith('57')) {
    return `+${digitsOnly}`;
  }
  return `+${digitsOnly}`;
}
