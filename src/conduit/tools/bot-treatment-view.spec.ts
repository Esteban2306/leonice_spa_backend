import {
  formatCop,
  formatDurationRange,
  formatPriceRange,
  toBotTreatment,
} from './bot-treatment-view';

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
  it('entrega precio en pesos y duración legibles, y solo lo que el bot necesita', () => {
    const view = toBotTreatment({
      ...base,
      activePromotion: null,
      aftercare: ['x'.repeat(500)],
      videoUrl: 'https://cdn/video.mp4',
    } as Parameters<typeof toBotTreatment>[0]);

    expect(view).toEqual({
      id: 't1',
      name: 'Alisado',
      category: 'Spa Capilar',
      tagline: 'Cabello liso',
      price: `$${(250000).toLocaleString('es-CO')} – $${(380000).toLocaleString('es-CO')}`,
      duration: '3 a 4 h',
      requiresAssessment: true,
    });
  });

  it('omite lo vacío: sin valoración, sin promoción y sin eslogan no hay campos', () => {
    const view = toBotTreatment({
      ...base,
      tagline: null,
      requiresPriorAssessment: false,
      basePriceMax: '250',
      baseDurationMinMinutes: 90,
      baseDurationMaxMinutes: 90,
    });
    expect(Object.keys(view).sort()).toEqual([
      'category',
      'duration',
      'id',
      'name',
      'price',
    ]);
    expect(view.price).toBe(`$${(250000).toLocaleString('es-CO')}`);
    expect(view.duration).toBe('1 h 30 min');
  });

  it('incluye la promoción con su precio solo cuando existe', () => {
    const view = toBotTreatment({
      ...base,
      activePromotion: { id: 'p1', name: 'Octubre', discountPercentage: '10' },
      effectiveBasePriceMin: 225,
      effectiveBasePriceMax: 342,
    });
    expect(view.promotion).toEqual({
      name: 'Octubre',
      discount: '10 %',
      price: `$${(225000).toLocaleString('es-CO')} – $${(342000).toLocaleString('es-CO')}`,
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
    expect(variable).toMatchObject({
      priceDependsOnHair: true,
      hairLengthPricing: [{ a: 1 }],
      hairColorSurcharges: [{ b: 2 }],
    });
  });

  it('es mucho más corto que la fila completa de antes', () => {
    const before = JSON.stringify({
      id: 't1',
      name: 'Alisado',
      categoryId: 'c1',
      category: 'Spa Capilar',
      tagline: 'Cabello liso',
      requiresPriorAssessment: true,
      hasHairVariablePricing: false,
      basePriceMin: '250',
      basePriceMax: '380',
      baseDurationMinMinutes: 180,
      baseDurationMaxMinutes: 240,
      activePromotion: null,
    });
    expect(JSON.stringify(toBotTreatment(base)).length).toBeLessThan(
      before.length,
    );
  });
});

describe('formatos', () => {
  it('precios en miles de COP', () => {
    expect(formatCop(35)).toBe(`$${(35000).toLocaleString('es-CO')}`);
    expect(formatPriceRange(null, null)).toBeNull();
    expect(formatPriceRange('200', null)).toBe(formatCop(200));
  });

  it('duraciones', () => {
    expect(formatDurationRange(60, 60)).toBe('1 h');
    expect(formatDurationRange(45, 45)).toBe('45 min');
    expect(formatDurationRange(150, 210)).toBe('2 h 30 min a 3 h 30 min');
    expect(formatDurationRange(null, null)).toBeNull();
  });
});
