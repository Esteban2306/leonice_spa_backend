import { toBotTreatment } from './bot-treatment-view';

const base = {
  id: 't1',
  name: 'Alisado',
  categoryId: 'c1',
  tagline: 'Cabello liso',
  requiresPriorAssessment: true,
  hasHairVariablePricing: false,
  basePriceMin: '250',
  basePriceMax: '380',
  baseDurationMinMinutes: 180,
  baseDurationMaxMinutes: 240,
  category: { name: 'Spa Capilar' },
};

describe('toBotTreatment', () => {
  it('conserva solo lo que el bot necesita para ofrecer y reservar', () => {
    const view = toBotTreatment({
      ...base,
      activePromotion: null,
      aftercare: ['x'.repeat(500)],
      videoUrl: 'https://cdn/video.mp4',
    } as Parameters<typeof toBotTreatment>[0]);

    expect(Object.keys(view).sort()).toEqual(
      [
        'activePromotion',
        'baseDurationMaxMinutes',
        'baseDurationMinMinutes',
        'basePriceMax',
        'basePriceMin',
        'category',
        'categoryId',
        'hasHairVariablePricing',
        'id',
        'name',
        'requiresPriorAssessment',
        'tagline',
      ].sort(),
    );
    expect(view.category).toBe('Spa Capilar');
  });

  it('incluye el precio con descuento solo cuando hay promoción', () => {
    const view = toBotTreatment({
      ...base,
      activePromotion: { id: 'p1', name: 'Octubre', discountPercentage: '10' },
      effectiveBasePriceMin: 225,
      effectiveBasePriceMax: 342,
    });

    expect(view.activePromotion?.name).toBe('Octubre');
    expect(view).toMatchObject({
      effectiveBasePriceMin: 225,
      effectiveBasePriceMax: 342,
    });
  });

  it('envía las tablas de cabello solo si el precio depende del cabello', () => {
    const plain = toBotTreatment({ ...base, hairLengthPricing: [{ a: 1 }] });
    const variable = toBotTreatment({
      ...base,
      hasHairVariablePricing: true,
      hairLengthPricing: [{ a: 1 }],
      hairColorSurcharges: [{ b: 2 }],
    });

    expect(plain).not.toHaveProperty('hairLengthPricing');
    expect(variable.hairLengthPricing).toEqual([{ a: 1 }]);
    expect(variable.hairColorSurcharges).toEqual([{ b: 2 }]);
  });
});
