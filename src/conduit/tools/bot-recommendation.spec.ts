import {
  detectConcerns,
  matchProducts,
  matchTreatments,
} from './bot-recommendation';

const TREATMENTS = [
  {
    name: 'Alisado',
    idealFor: [
      'Frizz y volumen difíciles de controlar',
      'Quien quiere ahorrar tiempo en el peinado diario',
      'Cabello con ondas que prefiere llevar liso',
    ],
    benefits: ['Cabello brillante y con caída'],
  },
  {
    name: 'Terapia de hidratación',
    idealFor: [
      'Cabello opaco o áspero al tacto',
      'Frizz que aparece con la humedad',
      'Cabello que se enreda con facilidad',
    ],
  },
  {
    name: 'Terapia de nutrición',
    idealFor: ['Puntas resecas o abiertas'],
    benefits: ['Brillo profundo y caída sedosa'],
  },
  {
    name: 'Terapia de control',
    idealFor: ['Raíz que se engrasa rápido', 'Descamación o caspa leve'],
  },
  {
    name: 'Terapia de rehabilitación',
    idealFor: ['Cabello con daño acumulado por años de químicos'],
  },
];

const product = (
  name: string,
  idealFor: string[],
  options: { kind?: 'SINGLE' | 'COMBO'; price?: number; tags?: string[] } = {},
) =>
  ({
    name,
    kind: options.kind ?? 'SINGLE',
    tagline: null,
    purpose: null,
    idealFor,
    benefits: [],
    tagAssignments: (options.tags ?? []).map((tag) => ({ tag: { name: tag } })),
    variants: [{ price: options.price ?? 60000 }],
  }) as never;

const CATALOG = [
  product(
    'Kit Hair Therapy Anticaída',
    ['Cabello frágil con tendencia a la caída'],
    {
      kind: 'COMBO',
      price: 180000,
    },
  ),
  product(
    'Tónico Rosemary Amazônica',
    ['Cuero cabelludo y cabello con tendencia a la caída'],
    {
      tags: ['Anticaída'],
    },
  ),
  product('Shampoo Argan Boom', ['Cabello seco que necesita hidratación']),
  product('Termoprotector', ['Cabello expuesto al calor']),
];

describe('detectConcerns', () => {
  it.each([
    ['se me está cayendo mucho el cabello', 'caida'],
    ['tengo caída', 'caida'],
    ['quiero algo anticaida', 'caida'],
    ['tengo mucho frizz', 'frizz'],
    ['lo tengo reseco y opaco', 'resequedad'],
    ['se me engrasa la raíz', 'grasa'],
    ['tengo caspa y me pica', 'caspa'],
    ['tengo las puntas abiertas', 'puntas'],
  ])('"%s" → %s', (text, key) => {
    expect(detectConcerns(text).map((c) => c.key)).toContain(key);
  });

  it('un mensaje sin necesidad capilar no detecta nada', () => {
    expect(detectConcerns('hola, buenos días')).toEqual([]);
  });
});

describe('recomendaciones con datos reales del catálogo', () => {
  it('para la caída no hay servicio, pero sí recomienda los productos y kits anticaída', () => {
    const concerns = detectConcerns('se me cae mucho el cabello');
    expect(matchTreatments(TREATMENTS, concerns)).toEqual([]);
    const products = matchProducts(CATALOG, concerns);
    expect(products.map((p) => p.name)).toEqual([
      'Kit Hair Therapy Anticaída',
      'Tónico Rosemary Amazônica',
    ]);
    expect(products[0]).toMatchObject({ type: 'ritual', price: '$180.000' });
  });

  it('"caída sedosa" o "brillante y con caída" no cuentan como servicios para la caída', () => {
    const concerns = detectConcerns('tengo caída');
    expect(matchTreatments(TREATMENTS, concerns)).toEqual([]);
  });

  it('frizz, poco volumen y caída: el servicio coincide por su "para quién es" y explica el porqué', () => {
    const concerns = detectConcerns(
      'tengo mucho frizz pero mi cabello es poco tengo caída',
    );
    const services = matchTreatments(TREATMENTS, concerns);
    expect(services.map((s) => s.item.name)).toEqual([
      'Alisado',
      'Terapia de hidratación',
    ]);
    expect(services[1].why).toEqual(['Frizz que aparece con la humedad']);
    expect(matchProducts(CATALOG, concerns).length).toBeGreaterThan(0);
  });

  it('grasa y caspa llevan a la terapia de control', () => {
    const services = matchTreatments(
      TREATMENTS,
      detectConcerns('se me engrasa rápido y tengo caspa'),
    );
    expect(services[0].item.name).toBe('Terapia de control');
  });
});
