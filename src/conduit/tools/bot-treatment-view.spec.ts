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
      priceIsRange: true,
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

  describe('precio según el perfil capilar', () => {
    const variable = {
      ...base,
      requiresPriorAssessment: false,
      hasHairVariablePricing: true,
      basePriceMin: '200',
      basePriceMax: '320',
      hairLengthPricing: [
        { hairLength: 'CORTO' as const, price: '200', durationMinutes: 120 },
        { hairLength: 'MEDIANO' as const, price: '260', durationMinutes: 150 },
        { hairLength: 'LARGO' as const, price: '300', durationMinutes: 180 },
      ],
      hairColorSurcharges: [
        {
          hairColor: 'CLARO' as const,
          surcharge: '20',
          extraDurationMinutes: 30,
        },
        {
          hairColor: 'OSCURO' as const,
          surcharge: '0',
          extraDurationMinutes: 0,
        },
      ],
    };
    const profile = (hairProfileUpdatedAt: Date | null) => ({
      hairLength: 'MEDIANO' as const,
      hairColor: 'CLARO' as const,
      hairProfileUpdatedAt,
    });

    it('sin clienta o sin perfil entrega el rango y avisa que es un rango', () => {
      for (const client of [undefined, null, profile(null)]) {
        const view = toBotTreatment(variable, client);
        expect(view.price).toBe(
          `$${(200000).toLocaleString('es-CO')} – $${(320000).toLocaleString('es-CO')}`,
        );
        expect(view).toMatchObject({ priceIsRange: true });
        expect(view).not.toHaveProperty('personalizedPrice');
      }
    });

    it('con perfil vigente entrega el precio fijo de su largo y color, y su duración', () => {
      const view = toBotTreatment(variable, profile(new Date()));
      expect(view.price).toBe(`$${(280000).toLocaleString('es-CO')}`);
      expect(view.duration).toBe('3 h');
      expect(view).toMatchObject({ personalizedPrice: true });
      expect(view).not.toHaveProperty('priceIsRange');
    });

    it('con perfil vencido vuelve al rango', () => {
      const old = new Date();
      old.setFullYear(old.getFullYear() - 3);
      const view = toBotTreatment(variable, profile(old));
      expect(view).toMatchObject({ priceIsRange: true });
    });

    it('la promoción se aplica al precio fijo de la clienta', () => {
      const view = toBotTreatment(
        {
          ...variable,
          activePromotion: {
            id: 'p',
            name: 'Octubre',
            discountPercentage: '10',
          },
        },
        profile(new Date()),
      );
      expect(view.promotion?.price).toBe(
        `$${(252000).toLocaleString('es-CO')}`,
      );
    });

    it('no manda las tablas de cabello al bot', () => {
      const view = toBotTreatment(variable, profile(new Date()));
      expect(view).not.toHaveProperty('hairLengthPricing');
      expect(view).not.toHaveProperty('hairColorSurcharges');
    });

    it('un servicio de precio único no es un rango aunque haya clienta', () => {
      const view = toBotTreatment(
        { ...base, basePriceMax: '250', requiresPriorAssessment: false },
        profile(new Date()),
      );
      expect(view).not.toHaveProperty('priceIsRange');
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
