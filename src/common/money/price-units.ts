export const COP_PER_PRICE_UNIT = 1000;
const PRICE_UNIT_DECIMALS = 100;

/**
 * El catálogo y `finalPrice` van en miles de COP con dos decimales
 * (35.5 = $35.500); lo que llega de afuera viene en pesos.
 */
export function priceUnitsOf(amountCop: number): number {
  const pesosPerStep = COP_PER_PRICE_UNIT / PRICE_UNIT_DECIMALS;
  return Math.round(amountCop / pesosPerStep) / PRICE_UNIT_DECIMALS;
}
