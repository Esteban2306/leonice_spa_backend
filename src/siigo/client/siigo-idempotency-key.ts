import type { SiigoReceiptLine } from '../domain/siigo-receipt-body';

const MAX_LENGTH = 30;
const LINE_SUFFIX: Record<SiigoReceiptLine, string> = {
  CASH: 'C',
  TRANSFER: 'T',
};

export function siigoIdempotencyKey(
  reservationId: string,
  line?: SiigoReceiptLine,
): string {
  const compact = reservationId.replace(/[^A-Za-z0-9]/g, '');
  const suffix = line ? LINE_SUFFIX[line] : '';
  return compact.slice(-(MAX_LENGTH - suffix.length)) + suffix;
}
