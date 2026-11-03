import {
  buildCampaignVariables,
  templateNeedsPromotion,
  templateNeedsVisit,
} from './campaign-variables';

const NOW = new Date('2026-11-10T15:00:00Z');
const promotion = {
  name: 'Semana de uñas',
  discountPercentage: '15.00',
  endsAt: new Date('2026-11-18T04:59:59Z'),
};

describe('buildCampaignVariables', () => {
  it('arma las variables de un anuncio de promoción con la vigencia en palabras', () => {
    const result = buildCampaignVariables(
      { variables: ['nombre', 'promocion', 'descuento', 'vigencia'] },
      { name: 'Ana', lastVisitAt: null },
      promotion,
      NOW,
    );
    expect(result).toEqual({
      variables: {
        nombre: 'Ana',
        promocion: 'Semana de uñas',
        descuento: '15',
        vigencia: 'hasta el 17 de noviembre',
      },
    });
  });

  it('calcula los días desde la última visita y omite a quien no tiene ninguna', () => {
    const template = { variables: ['nombre', 'dias'] };
    expect(
      buildCampaignVariables(
        template,
        { name: 'Ana', lastVisitAt: new Date('2026-10-01T15:00:00Z') },
        null,
        NOW,
      ),
    ).toEqual({ variables: { nombre: 'Ana', dias: '40' } });
    expect(
      buildCampaignVariables(
        template,
        { name: 'Ana', lastVisitAt: null },
        null,
        NOW,
      ),
    ).toEqual({ skip: 'Todavía no tiene una visita' });
  });

  it('una plantilla con promoción exige la promoción', () => {
    expect(
      buildCampaignVariables(
        { variables: ['nombre', 'promocion'] },
        { name: 'Ana', lastVisitAt: null },
        null,
        NOW,
      ),
    ).toEqual({ skip: 'La campaña no tiene promoción' });
  });

  it('detecta qué datos necesita cada plantilla', () => {
    expect(templateNeedsPromotion({ variables: ['nombre', 'descuento'] })).toBe(
      true,
    );
    expect(templateNeedsPromotion({ variables: ['nombre'] })).toBe(false);
    expect(templateNeedsVisit({ variables: ['nombre', 'dias'] })).toBe(true);
  });
});
