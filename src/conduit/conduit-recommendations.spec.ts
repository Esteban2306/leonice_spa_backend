import { ConduitSupportToolsController } from './conduit-support-tools.controller';

const treatment = (name: string, idealFor: string[]) => ({
  id: name,
  name,
  categoryId: 'c',
  tagline: null,
  requiresPriorAssessment: false,
  hasHairVariablePricing: false,
  basePriceMin: 200,
  basePriceMax: 200,
  baseDurationMinMinutes: 120,
  baseDurationMaxMinutes: 120,
  idealFor,
});

const product = (name: string, idealFor: string[]) => ({
  name,
  kind: 'COMBO',
  tagline: null,
  purpose: null,
  idealFor,
  benefits: [],
  tagAssignments: [],
  variants: [{ price: 250000 }],
});

function build() {
  return new ConduitSupportToolsController(
    {} as never,
    { findByPhone: jest.fn(() => Promise.resolve(null)) } as never,
    {} as never,
    {
      listRecords: jest.fn(() =>
        Promise.resolve([
          product('Kit Hair Therapy Anticaída', [
            'Cabello frágil con tendencia a la caída',
          ]),
        ]),
      ),
    } as never,
    {
      findAll: jest.fn(() =>
        Promise.resolve([
          treatment('Terapia de hidratación', [
            'Frizz que aparece con la humedad',
          ]),
        ]),
      ),
    } as never,
  );
}

const req = { conduitContact: { phone: '573001112233', lid: null } } as never;

describe('GET conduit/recommendations', () => {
  it('separa cada necesidad: frizz con su servicio y caída con sus productos', async () => {
    const out = await build().recommendations(
      req,
      'tengo mucho frizz y se me cae el cabello',
    );
    expect(out.status).toBe('found');
    type Need = {
      need: string;
      services: Array<Record<string, unknown>>;
      products: Array<Record<string, unknown>>;
    };
    const needs = (out as { needs: Need[] }).needs;
    const caida = needs.find((n) => n.need === 'caída del cabello')!;
    const frizz = needs.find((n) => n.need === 'frizz')!;
    expect(caida.services).toEqual([]);
    expect(caida.products[0]).toMatchObject({
      name: 'Kit Hair Therapy Anticaída',
      price: '$250.000',
    });
    expect(frizz.services[0]).toMatchObject({
      name: 'Terapia de hidratación',
      price: '$200.000',
      why: ['Frizz que aparece con la humedad'],
    });
  });

  it('sin una necesidad reconocible pide que la cuente, sin inventar', async () => {
    const out = await build().recommendations(req, 'hola');
    expect(out).toMatchObject({ status: 'need_unclear' });
  });
});
