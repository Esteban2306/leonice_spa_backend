import type { BotProductItem } from '../tools/bot-product-view';

export const MAX_PROMOTION_OFFERS = 8;

export interface BotPromotionOffer {
  type: 'servicio' | 'producto' | 'kit';
  name: string;
  promotion: string;
  discount: string;
  price: string | null;
  promoPrice: string | null;
  validUntil: string | null;
  recommendedForTreatments: string[];
}

export interface PromotedTreatmentItem {
  name: string;
  price?: string | null;
  promotion?: {
    name: string;
    discount: string;
    price?: string;
    validUntil?: string;
  };
}

export const CLOSING_OFFER_HINT =
  'Al final de tu respuesta, después del resumen, menciona esta promoción en una sola línea (🎁 nombre, descuento, precio con promoción y hasta cuándo), sin preguntar nada. Omítela si ya hablaron de ella en esta conversación.';

export const PROMOTIONS_HINT =
  'Son las promociones vigentes de servicios, productos y kits. Dilas con su descuento, precio con promoción y vigencia tal como vienen; no inventes otras.';

export const NO_PROMOTIONS_HINT =
  'Hoy no hay promociones vigentes: dilo con honestidad y no inventes ninguna.';

const COMBINING_MARKS = /\p{M}/gu;

const pesos = (value: number) =>
  `$${Math.round(value).toLocaleString('es-CO')}`;

const range = (low: number, high: number) =>
  low === high ? pesos(low) : `${pesos(low)} – ${pesos(high)}`;

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

export function collectOffers(
  treatments: readonly PromotedTreatmentItem[],
  products: readonly BotProductItem[],
): BotPromotionOffer[] {
  const services = treatments.flatMap((item): BotPromotionOffer[] =>
    item.promotion
      ? [
          {
            type: 'servicio',
            name: item.name,
            promotion: item.promotion.name,
            discount: item.promotion.discount,
            price: item.price ?? null,
            promoPrice: item.promotion.price ?? null,
            validUntil: item.promotion.validUntil ?? null,
            recommendedForTreatments: [],
          },
        ]
      : [],
  );
  const goods = products.flatMap((item): BotPromotionOffer[] =>
    item.promotion
      ? [
          {
            type: item.type === 'ritual' ? 'kit' : 'producto',
            name: item.name,
            promotion: item.promotion.name,
            discount: item.promotion.discount,
            price: range(item.priceFrom, item.priceTo),
            promoPrice: range(item.promotion.priceFrom, item.promotion.priceTo),
            validUntil: item.promotion.validUntil,
            recommendedForTreatments: item.recommendedForTreatments,
          },
        ]
      : [],
  );
  return [...services, ...goods];
}

const mentions = (text: string, name: string) =>
  normalizeText(text).includes(normalizeText(name));

export function pickAfterBooking(
  offers: readonly BotPromotionOffer[],
  bookedTreatments: readonly string[],
): BotPromotionOffer | null {
  const booked = new Set(bookedTreatments.map(normalizeText));
  const candidates = offers.filter(
    (offer) =>
      !(offer.type === 'servicio' && booked.has(normalizeText(offer.name))),
  );
  const goesWithBooking = (offer: BotPromotionOffer) =>
    offer.recommendedForTreatments.some((name) =>
      booked.has(normalizeText(name)),
    );
  return (
    candidates.find(
      (offer) => offer.type !== 'servicio' && goesWithBooking(offer),
    ) ??
    candidates.find((offer) => offer.type !== 'servicio') ??
    candidates[0] ??
    null
  );
}

export function pickAfterPurchase(
  offers: readonly BotPromotionOffer[],
  request: string,
): BotPromotionOffer | null {
  const candidates = offers.filter((offer) => !mentions(request, offer.name));
  return (
    candidates.find((offer) => offer.type === 'servicio') ??
    candidates[0] ??
    null
  );
}
