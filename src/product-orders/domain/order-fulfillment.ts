import { ProductFulfillment, ProductPaymentMethod } from '@prisma/client';
import { orderCode } from './order-pricing';
import { formatPesos } from './order-text';

export const FULFILLMENT_LABEL: Record<ProductFulfillment, string> = {
  DOMICILIO: 'a domicilio',
  RECOGER: 'recoge en el spa',
};

export const PAYMENT_LABEL: Record<ProductPaymentMethod, string> = {
  TRANSFERENCIA: 'transferencia (envía el comprobante)',
  CONTRAENTREGA: 'en efectivo al recibirlo',
  EN_TIENDA: 'en el spa al recogerlo',
};

export const ALLOWED_PAYMENTS: Record<
  ProductFulfillment,
  readonly ProductPaymentMethod[]
> = {
  DOMICILIO: ['TRANSFERENCIA', 'CONTRAENTREGA'],
  RECOGER: ['TRANSFERENCIA', 'EN_TIENDA'],
};

export function readyNoticeDetail(
  order: {
    number: number;
    fulfillment: ProductFulfillment | null;
    paymentMethod: ProductPaymentMethod | null;
    deliveryAddress: string | null;
    total: unknown;
  },
  settings: { pickupAddress: string | null },
): string {
  const total =
    order.total === null || order.total === undefined
      ? null
      : formatPesos(Number(order.total));
  const code = orderCode(order.number);
  if (order.fulfillment === 'DOMICILIO') {
    const where = order.deliveryAddress ? ` a ${order.deliveryAddress}` : '';
    const pay =
      order.paymentMethod === 'CONTRAENTREGA' && total
        ? ` Ten a mano ${total} para pagar al recibirlo.`
        : '';
    return `tu pedido *${code}* ya está listo y te lo llevamos${where}.${pay}`;
  }
  const where = settings.pickupAddress
    ? ` en ${settings.pickupAddress}`
    : ' en el spa';
  const pay =
    order.paymentMethod === 'EN_TIENDA' && total
      ? ` Lo pagas allá (${total}).`
      : '';
  return `tu pedido *${code}* ya está listo: puedes recogerlo${where}.${pay}`;
}
