import { readyNoticeDetail } from './order-fulfillment';

const base = { number: 7, total: '305000', deliveryAddress: null };

describe('aviso a la clienta cuando el equipo verifica su pedido', () => {
  it('a domicilio con contraentrega: le dice la dirección y cuánto pagar al recibirlo', () => {
    expect(
      readyNoticeDetail(
        {
          ...base,
          fulfillment: 'DOMICILIO',
          paymentMethod: 'CONTRAENTREGA',
          deliveryAddress: 'Cra 3 # 2-10',
        },
        { pickupAddress: null },
      ),
    ).toBe(
      'tu pedido *P-0007* ya está listo y te lo llevamos a Cra 3 # 2-10. Ten a mano $305.000 para pagar al recibirlo.',
    );
  });

  it('para recoger y pagar en el spa: le dice dónde y cuánto', () => {
    expect(
      readyNoticeDetail(
        { ...base, fulfillment: 'RECOGER', paymentMethod: 'EN_TIENDA' },
        { pickupAddress: 'Calle 5 # 4-20' },
      ),
    ).toBe(
      'tu pedido *P-0007* ya está listo: puedes recogerlo en Calle 5 # 4-20. Lo pagas allá ($305.000).',
    );
  });

  it('si ya pagó por transferencia no le cobra de nuevo', () => {
    expect(
      readyNoticeDetail(
        { ...base, fulfillment: 'RECOGER', paymentMethod: 'TRANSFERENCIA' },
        { pickupAddress: 'Calle 5 # 4-20' },
      ),
    ).not.toContain('$305.000');
  });
});
