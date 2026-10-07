/**
 * Convención de dinero: TODOS los montos (precios, adelantos, créditos) se
 * guardan en MILES de COP. 380 = $380.000 y 20 = $20.000. El front convierte.
 */
export const MONEY_UNIT_IN_COP = 1_000;

export const MIN_ADVANCE_AMOUNT = 20;

export function toCop(amountInThousands: number): number {
  return amountInThousands * MONEY_UNIT_IN_COP;
}
