export const RITUAL_MIN_ITEMS = 2;
export const RITUAL_MAX_ITEMS = 10;
export const RITUAL_MAX_QUANTITY = 10;

export interface RitualPricingItem {
  quantity: number;
  unitPrice: number;
}

export interface RitualPricing {
  pricePesos: number;
  separatePricePesos: number;
  savingsPesos: number;
  savingsPercent: number;
}

export function computeRitualPricing(
  price: number,
  items: RitualPricingItem[],
): RitualPricing {
  const separatePricePesos = items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  );
  const savingsPesos = separatePricePesos - price;
  const savingsPercent =
    separatePricePesos > 0
      ? Math.floor((savingsPesos / separatePricePesos) * 100)
      : 0;
  return {
    pricePesos: price,
    separatePricePesos,
    savingsPesos,
    savingsPercent,
  };
}

export interface RitualComponentState {
  variant: {
    isActive: boolean;
    product: { isActive: boolean; category?: { isActive: boolean } };
  };
}

export function isRitualComplete(items: RitualComponentState[]): boolean {
  return (
    items.length >= RITUAL_MIN_ITEMS &&
    items.every(
      ({ variant }) =>
        variant.isActive &&
        variant.product.isActive &&
        variant.product.category?.isActive !== false,
    )
  );
}

export function ritualVariantLabels(
  items: { quantity: number; brand: string }[],
): { brand: string; presentation: string } {
  const brands = [...new Set(items.map((item) => item.brand))];
  const units = items.reduce((total, item) => total + item.quantity, 0);
  return {
    brand: brands.length === 1 ? brands[0] : 'Varias marcas',
    presentation: `Ritual de ${units} productos`,
  };
}
