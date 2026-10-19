const CENTS = 100;
const PERCENT_HUNDREDTHS = 10_000;

export function applyPercentageDiscount(
  price: number,
  discountPercentage: number,
): number {
  if (!Number.isFinite(price) || !Number.isFinite(discountPercentage)) {
    throw new RangeError('El precio y el descuento deben ser números finitos');
  }
  if (price < 0) throw new RangeError('El precio no puede ser negativo');
  if (discountPercentage < 0 || discountPercentage > 100) {
    throw new RangeError('El descuento debe estar entre 0 y 100');
  }

  const priceCents = Math.round(price * CENTS);
  const remainingHundredths =
    PERCENT_HUNDREDTHS - Math.round(discountPercentage * CENTS);
  const discountedCents = Math.round(
    (priceCents * remainingHundredths) / PERCENT_HUNDREDTHS,
  );
  return discountedCents / CENTS;
}
