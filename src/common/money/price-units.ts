export const COP_PER_PRICE_UNIT = 1000;
const PRICE_UNIT_DECIMALS = 100;

/** Rango válido para el precio que una persona le pone a una reserva. */
export const MIN_PRICE_COP = 1_000;
export const MAX_PRICE_COP = 1_000_000;
export const PRICE_RANGE_MESSAGE =
  'El precio de una reserva debe estar entre $1.000 y $1.000.000.';

/**
 * El catálogo y `finalPrice` van en miles de COP con dos decimales
 * (35.5 = $35.500); lo que llega de afuera viene en pesos.
 */
export function priceUnitsOf(amountCop: number): number {
  const pesosPerStep = COP_PER_PRICE_UNIT / PRICE_UNIT_DECIMALS;
  return Math.round(amountCop / pesosPerStep) / PRICE_UNIT_DECIMALS;
}
