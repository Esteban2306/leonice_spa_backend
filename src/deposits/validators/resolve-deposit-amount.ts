import { DepositCoverage } from '@prisma/client';

export type DepositAmountResolution =
  | { ok: true; amount: number }
  | { ok: false; reason: 'AMOUNT_REQUIRED_FOR_FULL_PAYMENT' | 'BELOW_MINIMUM' };

export function resolveDepositAmount(params: {
  coverage: DepositCoverage;
  requested: number | undefined;
  minimum: number;
}): DepositAmountResolution {
  const { coverage, requested, minimum } = params;

  if (coverage === DepositCoverage.PAGO_COMPLETO && requested === undefined) {
    return { ok: false, reason: 'AMOUNT_REQUIRED_FOR_FULL_PAYMENT' };
  }

  const amount = requested ?? minimum;
  if (amount < minimum) return { ok: false, reason: 'BELOW_MINIMUM' };

  return { ok: true, amount };
}
