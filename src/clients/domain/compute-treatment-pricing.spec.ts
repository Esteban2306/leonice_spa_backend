import {
  Client,
  HairColor,
  HairLength,
  Prisma,
  Promotion,
  Treatment,
  TreatmentHairColorSurcharge,
  TreatmentHairLengthPricing,
} from '@prisma/client';
import {
  applyPromotionDiscount,
  combineHairPricing,
  determineTreatmentPricing,
} from './compute-treatment-pricing';

const NOW = new Date();
const RECENT = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const LONG_AGO = new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000);

const audit = {
  id: 'fila',
  treatmentId: 'tratamiento',
  createdAt: NOW,
  updatedAt: NOW,
};

const lengthRow = (
  hairLength: HairLength,
  price: number,
  durationMinutes: number,
): TreatmentHairLengthPricing => ({
  ...audit,
  hairLength,
  price: new Prisma.Decimal(price),
  durationMinutes,
});

const colorRow = (
  hairColor: HairColor,
  surcharge: number,
  extraDurationMinutes: number,
): TreatmentHairColorSurcharge => ({
  ...audit,
  hairColor,
  surcharge: new Prisma.Decimal(surcharge),
  extraDurationMinutes,
});

const LENGTHS = [
  lengthRow('CORTO', 250, 150),
  lengthRow('MEDIANO', 300, 180),
  lengthRow('LARGO', 380, 240),
];
const COLORS = [colorRow('CLARO', 0, 0), colorRow('OSCURO', 20, 30)];

type PricedTreatment = Treatment & {
  hairLengthPricing: TreatmentHairLengthPricing[];
  hairColorSurcharges: TreatmentHairColorSurcharge[];
};

const treatment = (overrides: Partial<PricedTreatment> = {}) =>
  ({
    requiresPriorAssessment: false,
    hasHairVariablePricing: false,
    basePriceMin: new Prisma.Decimal(200),
    basePriceMax: new Prisma.Decimal(350),
    baseDurationMinMinutes: 120,
    baseDurationMaxMinutes: 180,
    hairLengthPricing: [],
    hairColorSurcharges: [],
    ...overrides,
  }) as unknown as PricedTreatment;

const variable = (overrides: Partial<PricedTreatment> = {}) =>
  treatment({
    hasHairVariablePricing: true,
    hairLengthPricing: LENGTHS,
    hairColorSurcharges: COLORS,
    ...overrides,
  });

const profile = (
  overrides: Partial<
    Pick<Client, 'hairLength' | 'hairColor' | 'hairProfileUpdatedAt'>
  > = {},
) => ({
  hairLength: 'MEDIANO' as HairLength,
  hairColor: 'OSCURO' as HairColor,
  hairProfileUpdatedAt: RECENT,
  ...overrides,
});

describe('combineHairPricing', () => {
  it('suma el recargo de color al precio por largo y la duración extra', () => {
    expect(combineHairPricing(LENGTHS, COLORS, 'LARGO', 'OSCURO')).toEqual({
      price: 400,
      durationMinutes: 270,
    });
    expect(combineHairPricing(LENGTHS, COLORS, 'CORTO', 'CLARO')).toEqual({
      price: 250,
      durationMinutes: 150,
    });
  });

  it('sin recargo configurado para el color solo cobra el largo', () => {
    expect(combineHairPricing(LENGTHS, [], 'MEDIANO', 'OSCURO')).toEqual({
      price: 300,
      durationMinutes: 180,
    });
  });

  it('falla de forma explícita si falta el precio del largo en vez de cobrar cero', () => {
    expect(() =>
      combineHairPricing(
        [lengthRow('CORTO', 250, 150)],
        COLORS,
        'LARGO',
        'CLARO',
      ),
    ).toThrow(/LARGO/);
  });
});

describe('determineTreatmentPricing', () => {
  describe('servicios con precio fijo', () => {
    it('sin valoración previa cobra el precio mínimo y la duración mínima', () => {
      expect(determineTreatmentPricing(treatment(), profile())).toEqual({
        price: 200,
        durationMinutes: 120,
        forcesAssessment: false,
      });
    });

    it('con valoración previa reserva el peor caso: precio y duración máximos', () => {
      expect(
        determineTreatmentPricing(
          treatment({ requiresPriorAssessment: true }),
          profile(),
        ),
      ).toEqual({ price: 350, durationMinutes: 180, forcesAssessment: false });
    });

    it('sin precio configurado no inventa uno: queda en cero y duración de 60 minutos', () => {
      expect(
        determineTreatmentPricing(
          treatment({
            basePriceMin: null,
            basePriceMax: null,
            baseDurationMinMinutes: null,
            baseDurationMaxMinutes: null,
          }),
          profile(),
        ),
      ).toEqual({ price: 0, durationMinutes: 60, forcesAssessment: false });
    });

    it('usa la duración máxima si falta la mínima', () => {
      expect(
        determineTreatmentPricing(
          treatment({ baseDurationMinMinutes: null }),
          profile(),
        ).durationMinutes,
      ).toBe(180);
    });

    it('un servicio marcado con precio por cabello pero sin tabla de largos se trata como precio fijo', () => {
      expect(
        determineTreatmentPricing(
          treatment({ hasHairVariablePricing: true }),
          profile({ hairLength: null }),
        ),
      ).toMatchObject({ price: 200, forcesAssessment: false });
    });
  });

  describe('servicios con precio por largo y color', () => {
    it('con perfil capilar vigente cobra el largo más el recargo de color', () => {
      expect(determineTreatmentPricing(variable(), profile())).toEqual({
        price: 320,
        durationMinutes: 210,
        forcesAssessment: false,
      });
    });

    it('un perfil vigente solo fuerza valoración si el servicio la exige', () => {
      expect(
        determineTreatmentPricing(
          variable({ requiresPriorAssessment: true }),
          profile(),
        ).forcesAssessment,
      ).toBe(true);
    });

    it.each([
      [
        'sin perfil',
        { hairLength: null, hairColor: null, hairProfileUpdatedAt: null },
      ],
      ['perfil vencido (más de 4 meses)', { hairProfileUpdatedAt: LONG_AGO }],
      ['sin color', { hairColor: null }],
      ['sin largo', { hairLength: null }],
    ])('%s: cobra el peor caso y obliga a valoración', (_label, overrides) => {
      expect(determineTreatmentPricing(variable(), profile(overrides))).toEqual(
        {
          price: 400,
          durationMinutes: 270,
          forcesAssessment: true,
        },
      );
    });

    it('el peor caso nunca es menor que el precio de ninguna combinación posible', () => {
      const worst = determineTreatmentPricing(
        variable(),
        profile({ hairProfileUpdatedAt: null }),
      );
      for (const length of ['CORTO', 'MEDIANO', 'LARGO'] as const) {
        for (const color of ['CLARO', 'OSCURO'] as const) {
          const combo = combineHairPricing(LENGTHS, COLORS, length, color);
          expect(worst.price).toBeGreaterThanOrEqual(combo.price);
          expect(worst.durationMinutes).toBeGreaterThanOrEqual(
            combo.durationMinutes,
          );
        }
      }
    });
  });
});

describe('applyPromotionDiscount', () => {
  const pricing = { price: 380, durationMinutes: 240, forcesAssessment: true };
  const promo = (discountPercentage: number) =>
    ({ discountPercentage }) as unknown as Promotion;

  it('sin promoción devuelve el mismo precio', () => {
    expect(applyPromotionDiscount(pricing, null)).toBe(pricing);
  });

  it('descuenta solo el precio y conserva duración y valoración', () => {
    expect(applyPromotionDiscount(pricing, promo(15))).toEqual({
      price: 323,
      durationMinutes: 240,
      forcesAssessment: true,
    });
  });

  it('acepta el porcentaje como texto decimal, como lo entrega Prisma', () => {
    expect(
      applyPromotionDiscount(pricing, {
        discountPercentage: '12.50',
      } as unknown as Promotion).price,
    ).toBe(332.5);
  });

  it('100 % deja el servicio gratis sin precios negativos', () => {
    expect(applyPromotionDiscount(pricing, promo(100)).price).toBe(0);
  });
});
