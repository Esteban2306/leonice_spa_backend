import { PaymentMethod } from '@prisma/client';

export const SIIGO_INCOME_PAYLOAD_VERSION = 1;

export interface SiigoIncomePayload {
  version: typeof SIIGO_INCOME_PAYLOAD_VERSION;
  reservationId: string;
  completedAt: string;
  treatment: { id: string; name: string };
  amountCopThousands: number;
  paymentMethod: PaymentMethod;
  breakdownCopThousands: { cash: number; transfer: number; advance: number };
}

export interface BuildSiigoIncomePayloadInput {
  reservationId: string;
  completedAt: Date;
  treatment: { id: string; name: string };
  price: number;
  paymentMethod: PaymentMethod;
  cash: number;
  transfer: number;
  advance: number;
}

export function buildSiigoIncomePayload(
  input: BuildSiigoIncomePayloadInput,
): SiigoIncomePayload {
  return {
    version: SIIGO_INCOME_PAYLOAD_VERSION,
    reservationId: input.reservationId,
    completedAt: input.completedAt.toISOString(),
    treatment: { id: input.treatment.id, name: input.treatment.name },
    amountCopThousands: input.price,
    paymentMethod: input.paymentMethod,
    breakdownCopThousands: {
      cash: input.cash,
      transfer: input.transfer,
      advance: input.advance,
    },
  };
}
