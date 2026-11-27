import { priceUnitsOf } from './price-units';

describe('pesos a unidades de precio (miles de COP)', () => {
  it.each([
    [350_000, 350],
    [35_500, 35.5],
    [35_555, 35.56],
    [10_000_000, 10_000],
    [0, 0],
  ])('$%i son %p', (pesos, units) => {
    expect(priceUnitsOf(pesos)).toBe(units);
  });
});
