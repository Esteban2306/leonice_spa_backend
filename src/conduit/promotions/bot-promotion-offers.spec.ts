import type { BotProductItem } from '../tools/bot-product-view';
import {
  BotPromotionOffer,
  collectOffers,
  pickAfterBooking,
  pickAfterPurchase,
} from './bot-promotion-offers';

const offer = (
  type: BotPromotionOffer['type'],
  name: string,
  recommendedForTreatments: string[] = [],
): BotPromotionOffer => ({
  type,
  name,
  promotion: 'Mes del cabello',
  discount: '15 %',
  price: '$100.000',
  promoPrice: '$85.000',
  validUntil: '30 de noviembre',
  recommendedForTreatments,
});

describe('promociones para ofrecer', () => {
  it('reúne servicios, productos y kits en promoción con sus precios', () => {
    const offers = collectOffers(
      [
        {
          name: 'Alisado orgánico',
          price: '$300.000',
          promotion: {
            name: 'Semana del alisado',
            discount: '20 %',
            price: '$240.000',
            validUntil: '30 de noviembre',
          },
        },
        { name: 'Corte de cabello', price: '$45.000' },
      ],
      [
        {
          type: 'ritual',
          name: 'Ritual hidratante',
          priceFrom: 85000,
          priceTo: 85000,
          recommendedForTreatments: ['Hidratación profunda'],
          promotion: {
            name: 'Kits de noviembre',
            discount: '10 %',
            priceFrom: 76500,
            priceTo: 76500,
            validUntil: '30 de noviembre',
          },
        } as BotProductItem,
      ],
    );
    expect(offers).toEqual([
      expect.objectContaining({
        type: 'servicio',
        name: 'Alisado orgánico',
        promoPrice: '$240.000',
      }),
      expect.objectContaining({
        type: 'kit',
        name: 'Ritual hidratante',
        price: '$85.000',
        promoPrice: '$76.500',
      }),
    ]);
  });

  it('después de reservar prefiere el producto que va con el servicio reservado', () => {
    const picked = pickAfterBooking(
      [
        offer('servicio', 'Keratina'),
        offer('producto', 'Aceite capilar'),
        offer('kit', 'Kit post alisado', ['Alisado orgánico']),
      ],
      ['Alisado orgánico'],
    );
    expect(picked?.name).toBe('Kit post alisado');
  });

  it('después de reservar no ofrece el mismo servicio que acaba de reservar', () => {
    expect(
      pickAfterBooking(
        [offer('servicio', 'Alisado orgánico')],
        ['Alisado Orgánico'],
      ),
    ).toBeNull();
  });

  it('después de pedir un producto ofrece un servicio y no repite lo que pidió', () => {
    const offers = [
      offer('producto', 'Shampoo hidratante'),
      offer('servicio', 'Hidratación profunda'),
    ];
    expect(
      pickAfterPurchase(offers, 'shampoo hidratante 500 ml x1')?.name,
    ).toBe('Hidratación profunda');
    expect(
      pickAfterPurchase([offers[0]], 'Shampoo Hidratante 500 ml'),
    ).toBeNull();
  });
});
