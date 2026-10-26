import { ConduitBookingToolsController } from './conduit-booking-tools.controller';
import { toBotTreatmentDetail } from './tools/bot-treatment-view';

const treatment = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Alisado orgánico',
  slug: 'alisado-organico',
  categoryId: 'c1',
  tagline: 'Alisado sin químicos fuertes',
  requiresPriorAssessment: true,
  hasHairVariablePricing: false,
  basePriceMin: 250,
  basePriceMax: 380,
  baseDurationMinMinutes: 120,
  baseDurationMaxMinutes: 180,
  category: { name: 'Capilares' },
  summary: 'Reduce el frizz y alisa de forma gradual.',
  idealFor: ['Cabello rizado'],
  benefits: [
    'Menos frizz',
    'Brillo',
    'Suavidad',
    'Fácil de peinar',
    'Dura meses',
    'Extra',
  ],
  results: 'Cabello liso',
  considerations: ['No usar plancha el primer día'],
  recommendedFrequency: 'Cada 4 meses',
  ...over,
});

function build(treatments: unknown[]) {
  return new ConduitBookingToolsController(
    { findAll: jest.fn(() => Promise.resolve(treatments)) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { findByPhone: jest.fn(() => Promise.resolve(null)) } as never,
    {} as never,
  );
}

const req = { conduitContact: { phone: '573001112233' } } as never;

describe('toBotTreatmentDetail', () => {
  it('arma una ficha lista para mostrar con precio, duración, beneficios y notas', () => {
    const { card, detail } = toBotTreatmentDetail(treatment());
    expect(card.title).toBe('*Alisado orgánico*');
    expect(card.summary).toBe('Reduce el frizz y alisa de forma gradual.');
    expect(card.facts).toEqual([
      '💰 Precio: $250.000 – $380.000',
      '⏱️ Duración: 2 a 3 h',
    ]);
    expect(card.benefits).toHaveLength(5);
    expect(card.benefits[0]).toBe('• Menos frizz');
    expect(card.notes).toEqual([
      'El precio final se confirma después del diagnóstico en el spa.',
      'Antes de agendar se hace una valoración.',
    ]);
    expect(detail.recommendedFrequency).toBe('Cada 4 meses');
  });

  it('sin resumen usa el eslogan y sin beneficios deja la lista vacía', () => {
    const { card } = toBotTreatmentDetail(
      treatment({
        summary: null,
        benefits: [],
        requiresPriorAssessment: false,
        basePriceMax: 250,
      }),
    );
    expect(card.summary).toBe('Alisado sin químicos fuertes');
    expect(card.benefits).toEqual([]);
    expect(card.notes).toEqual([]);
    expect(card.facts[0]).toBe('💰 Precio: $250.000');
  });
});

describe('GET conduit/booking/treatments/detail', () => {
  const catalog = [
    treatment(),
    treatment({
      id: 't2',
      name: 'Alisado con keratina',
      slug: 'alisado-keratina',
    }),
    treatment({
      id: 't3',
      name: 'Hidratación profunda',
      slug: 'hidratacion-profunda',
    }),
  ];

  it('devuelve la ficha cuando el nombre identifica un tratamiento', async () => {
    const out = await build(catalog).findTreatmentDetail(
      req,
      'hidratación profunda',
    );
    expect(out).toMatchObject({
      status: 'found',
      id: 't3',
      card: { title: '*Hidratación profunda*' },
    });
  });

  it('un nombre ambiguo devuelve las opciones', async () => {
    const out = await build(catalog).findTreatmentDetail(req, 'alisado');
    expect(out).toMatchObject({ status: 'ambiguous' });
    expect((out as { optionNames: string[] }).optionNames).toEqual([
      '• Alisado orgánico',
      '• Alisado con keratina',
    ]);
  });

  it('lo desconocido o vacío es not_found', async () => {
    expect(
      await build(catalog).findTreatmentDetail(req, 'masaje tailandés'),
    ).toEqual({
      status: 'not_found',
    });
    expect(await build(catalog).findTreatmentDetail(req, undefined)).toEqual({
      status: 'not_found',
    });
  });
});
