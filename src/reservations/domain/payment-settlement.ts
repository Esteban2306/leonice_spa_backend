import { PaymentMethod } from '@prisma/client';

const toCents = (amount: number) => Math.round(amount * 100);

export interface PaymentBreakdown {
  price: number;
  advance: number;
  cash: number;
  transfer: number;
}

export function balanceDue(price: number, advance: number): number {
  return Math.max(toCents(price) - toCents(advance), 0) / 100;
}

export function collectedMatchesBalance(breakdown: PaymentBreakdown): boolean {
  const collected = toCents(breakdown.cash) + toCents(breakdown.transfer);
  return collected === toCents(balanceDue(breakdown.price, breakdown.advance));
}

export function derivePaymentMethod(
  breakdown: Pick<PaymentBreakdown, 'advance' | 'cash' | 'transfer'>,
): PaymentMethod {
  const nonCash = toCents(breakdown.transfer) + toCents(breakdown.advance);
  if (toCents(breakdown.cash) > 0 && nonCash > 0) return PaymentMethod.MIXTO;
  if (toCents(breakdown.cash) > 0) return PaymentMethod.EFECTIVO;
  return PaymentMethod.TRANSFERENCIA;
}
