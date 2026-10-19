import { applyPercentageDiscount } from './percentage-discount';

function exactDiscountedCents(
  priceCents: number,
  discountHundredths: number,
): number {
  const numerator = BigInt(priceCents) * BigInt(10_000 - discountHundredths);
  const denominator = 10_000n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(remainder * 2n >= denominator ? quotient + 1n : quotient);
}

describe('applyPercentageDiscount', () => {
  it('aplica descuentos típicos sin error de punto flotante', () => {
    expect(applyPercentageDiscount(380, 15)).toBe(323);
    expect(applyPercentageDiscount(250, 10)).toBe(225);
    expect(applyPercentageDiscount(200, 20)).toBe(160);
    expect(applyPercentageDiscount(199.99, 10)).toBe(179.99);
    expect(applyPercentageDiscount(0.1, 50)).toBe(0.05);
  });

  it('0 % no cambia el precio y 100 % lo deja en cero', () => {
    expect(applyPercentageDiscount(380, 0)).toBe(380);
    expect(applyPercentageDiscount(380, 100)).toBe(0);
    expect(applyPercentageDiscount(0, 30)).toBe(0);
  });

  it('redondea al centavo hacia arriba cuando queda exactamente en la mitad', () => {
    expect(applyPercentageDiscount(1.01, 50)).toBe(0.51);
    expect(applyPercentageDiscount(0.05, 50)).toBe(0.03);
  });

  it('coincide con la aritmética decimal exacta en 20 000 casos aleatorios (precios con centavos y descuentos con dos decimales)', () => {
    let seed = 1234567;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 20_000; i++) {
      const priceCents = Math.floor(next() * 100_000_000);
      const discountHundredths = Math.floor(next() * 10_001);
      const result = applyPercentageDiscount(
        priceCents / 100,
        discountHundredths / 100,
      );
      expect(Math.round(result * 100)).toBe(
        exactDiscountedCents(priceCents, discountHundredths),
      );
    }
  });

  it('nunca produce un precio mayor al original ni negativo', () => {
    for (const price of [0, 0.01, 1, 49.99, 250, 380, 9999.99]) {
      for (const pct of [0, 0.01, 5, 33.33, 50, 99.99, 100]) {
        const result = applyPercentageDiscount(price, pct);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(price);
      }
    }
  });

  it('rechaza entradas inválidas en vez de producir precios absurdos', () => {
    expect(() => applyPercentageDiscount(-1, 10)).toThrow(RangeError);
    expect(() => applyPercentageDiscount(100, -5)).toThrow(RangeError);
    expect(() => applyPercentageDiscount(100, 100.01)).toThrow(RangeError);
    expect(() => applyPercentageDiscount(NaN, 10)).toThrow(RangeError);
    expect(() => applyPercentageDiscount(100, Infinity)).toThrow(RangeError);
  });
});
