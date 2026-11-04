import { buildFollowUpMessage } from './follow-up-message';

const promotion = { name: 'Hidratación', discountPercentage: '15.00' };
const context = {
  clientName: 'Ana',
  treatmentName: 'Alisado orgánico',
  promotion: null,
};

describe('buildFollowUpMessage', () => {
  it('usa la plantilla elegida con el tratamiento y los días de la regla', () => {
    const result = buildFollowUpMessage(
      { templateCode: 'MAINTENANCE_REMINDER', reactivationDays: 30 },
      context,
    );
    expect(result).toMatchObject({
      template: { code: 'MAINTENANCE_REMINDER' },
      variables: { nombre: 'Ana', tratamiento: 'Alisado orgánico', dias: '30' },
    });
  });

  it('sin plantilla elegida mantiene el comportamiento anterior', () => {
    expect(
      buildFollowUpMessage(
        { templateCode: null, reactivationDays: 60 },
        context,
      ),
    ).toMatchObject({
      template: { code: 'REACTIVATION' },
      variables: { nombre: 'Ana', dias: '60' },
    });
    expect(
      buildFollowUpMessage(
        { templateCode: null, reactivationDays: 60 },
        { ...context, promotion },
      ),
    ).toMatchObject({
      template: { code: 'REACTIVATION_PROMO' },
      variables: { promocion: 'Hidratación', descuento: '15' },
    });
  });

  it('omite el envío si la plantilla pide una promoción que ya no está vigente', () => {
    expect(
      buildFollowUpMessage(
        { templateCode: 'REACTIVATION_PROMO', reactivationDays: 60 },
        context,
      ),
    ).toEqual({ skip: 'La promoción de la regla ya no está vigente' });
  });

  it('omite el envío si la plantilla ya no existe o no es de seguimiento', () => {
    for (const templateCode of ['NO_EXISTE', 'PROMOTION_BROADCAST']) {
      expect(
        buildFollowUpMessage({ templateCode, reactivationDays: 30 }, context),
      ).toEqual({ skip: 'La plantilla de la regla ya no existe' });
    }
  });
});
