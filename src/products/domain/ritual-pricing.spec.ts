import {
  computeRitualPricing,
  isRitualComplete,
  ritualVariantLabels,
} from './ritual-pricing';

describe('computeRitualPricing', () => {
  it('suma lo incluido por cantidad y calcula el ahorro frente al precio fijo', () => {
    expect(
      computeRitualPricing(215000, [
        { quantity: 1, unitPrice: 80000 },
        { quantity: 1, unitPrice: 80000 },
        { quantity: 1, unitPrice: 90000 },
      ]),
    ).toEqual({
      pricePesos: 215000,
      separatePricePesos: 250000,
      savingsPesos: 35000,
      savingsPercent: 14,
    });
  });

  it('multiplica por la cantidad de cada producto', () => {
    expect(
      computeRitualPricing(100000, [
        { quantity: 2, unitPrice: 40000 },
        { quantity: 1, unitPrice: 30000 },
      ]).separatePricePesos,
    ).toBe(110000);
  });

  it('reporta ahorro negativo cuando el Ritual cuesta más que por separado', () => {
    const pricing = computeRitualPricing(260000, [
      { quantity: 1, unitPrice: 250000 },
    ]);
    expect(pricing.savingsPesos).toBe(-10000);
    expect(pricing.savingsPercent).toBeLessThan(0);
  });

  it('no divide por cero sin precios', () => {
    expect(computeRitualPricing(0, []).savingsPercent).toBe(0);
  });
});

describe('isRitualComplete', () => {
  const ok = { variant: { isActive: true, product: { isActive: true } } };

  it('exige mínimo dos productos', () => {
    expect(isRitualComplete([ok])).toBe(false);
    expect(isRitualComplete([ok, ok])).toBe(true);
  });

  it('queda incompleto si una presentación o su producto están inactivos', () => {
    expect(
      isRitualComplete([
        ok,
        { variant: { isActive: false, product: { isActive: true } } },
      ]),
    ).toBe(false);
    expect(
      isRitualComplete([
        ok,
        { variant: { isActive: true, product: { isActive: false } } },
      ]),
    ).toBe(false);
  });

  it('queda incompleto si la categoría del producto incluido está inactiva', () => {
    expect(
      isRitualComplete([
        ok,
        {
          variant: {
            isActive: true,
            product: { isActive: true, category: { isActive: false } },
          },
        },
      ]),
    ).toBe(false);
  });
});

describe('ritualVariantLabels', () => {
  it('usa la marca común y cuenta las unidades', () => {
    expect(
      ritualVariantLabels([
        { quantity: 1, brand: 'Amazônica' },
        { quantity: 2, brand: 'Amazônica' },
      ]),
    ).toEqual({ brand: 'Amazônica', presentation: 'Ritual de 3 productos' });
  });

  it('marca "Varias marcas" cuando se mezclan', () => {
    expect(
      ritualVariantLabels([
        { quantity: 1, brand: 'Amazônica' },
        { quantity: 1, brand: 'MAIS' },
      ]).brand,
    ).toBe('Varias marcas');
  });
});
