import { Promotion } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  toCategorySummary,
  toTreatmentDetail,
  toShowcasePrice,
} from './showcase.mapper';
import type {
  ShowcaseCategoryRecord,
  ShowcaseTreatmentRecord,
} from './showcase.repository';

const CATEGORY_ID = 'cat-hair';
const NOW = new Date('2026-10-15T00:00:00Z');

function treatment(
  id: string,
  overrides: Partial<ShowcaseTreatmentRecord> = {},
): ShowcaseTreatmentRecord {
  return {
    id,
    categoryId: CATEGORY_ID,
    name: `Terapia ${id}`,
    slug: `terapia-${id}`,
    requiresPriorAssessment: false,
    basePriceMin: new Decimal(200),
    basePriceMax: new Decimal(200),
    baseDurationMinMinutes: 120,
    baseDurationMaxMinutes: 120,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    hasHairVariablePricing: false,
    tagline: null,
    summary: null,
    idealFor: [],
    benefits: ['Brillo'],
    results: null,
    aftercare: [],
    considerations: [],
    recommendedFrequency: null,
    videoUrl: null,
    videoPublicId: null,
    posterUrl: null,
    contentNeedsReview: false,
    displayOrder: 0,
    steps: [],
    recommendations: [],
    ...overrides,
  };
}

function category(
  treatments: ShowcaseTreatmentRecord[],
): ShowcaseCategoryRecord {
  return {
    id: CATEGORY_ID,
    name: 'Spa Capilar',
    slug: 'spa-capilar',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    isPrincipal: true,
    tracksHairProfile: true,
    tagline: null,
    description: null,
    iconKey: 'sparkles',
    showOnWebsite: true,
    displayOrder: 0,
    treatments,
  };
}

function promotion(treatmentId: string): Promotion {
  return {
    id: 'promo',
    name: 'Octubre capilar',
    discountPercentage: new Decimal(10),
    startsAt: NOW,
    endsAt: NOW,
    treatmentId,
    categoryId: null,
    isActive: true,
    createdAt: NOW,
  };
}

describe('showcase mapper', () => {
  it('aplica la promoción vigente sobre el rango de precio', () => {
    const price = toShowcasePrice(
      treatment('a', { basePriceMax: new Decimal(300) }),
      [promotion('a')],
    );

    expect(price).toEqual({
      fromThousands: 200,
      toThousands: 300,
      promotion: {
        name: 'Octubre capilar',
        discountPercentage: 10,
        fromThousands: 180,
        toThousands: 270,
      },
    });
  });

  it('lee precios serializados como texto desde la caché', () => {
    const cached = treatment('a', {
      basePriceMin: '250' as unknown as Decimal,
      basePriceMax: null,
    });

    expect(toShowcasePrice(cached, [])).toEqual({
      fromThousands: 250,
      toThousands: 250,
      promotion: null,
    });
  });

  it('resume la categoría con el menor precio efectivo y el primer póster', () => {
    const summary = toCategorySummary(
      category([
        treatment('a', {
          baseDurationMinMinutes: 90,
          baseDurationMaxMinutes: 90,
        }),
        treatment('b', {
          posterUrl: 'https://poster.jpg',
          baseDurationMaxMinutes: 180,
        }),
      ]),
      [promotion('b')],
    );

    expect(summary).toMatchObject({
      slug: 'spa-capilar',
      treatmentCount: 2,
      priceFromThousands: 180,
      durationMinMinutes: 90,
      durationMaxMinutes: 180,
      posterUrl: 'https://poster.jpg',
      hasPromotion: true,
    });
  });

  it('arma el detalle con pasos ordenados y relacionados sin incluirse a sí mismo', () => {
    const steps = [
      {
        id: 's1',
        treatmentId: 'a',
        position: 1,
        title: 'Diagnóstico',
        description: 'Revisamos tu cabello.',
        durationMinutes: 15,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const tree = category([
      treatment('a', { steps }),
      treatment('b'),
      treatment('c'),
      treatment('d'),
      treatment('e'),
    ]);

    const detail = toTreatmentDetail(tree, tree.treatments[0], []);

    expect(detail.stepCount).toBe(1);
    expect(detail.contentNeedsReview).toBe(false);
    expect(detail.steps).toEqual([
      {
        position: 1,
        title: 'Diagnóstico',
        description: 'Revisamos tu cabello.',
        durationMinutes: 15,
      },
    ]);
    expect(detail.related.map((card) => card.id)).toEqual(['b', 'c', 'd']);
    expect(detail.category.slug).toBe('spa-capilar');
  });
});
