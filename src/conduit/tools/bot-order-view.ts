import type { PricedOrder } from '../../product-orders/domain/order-pricing';
import { orderCode } from '../../product-orders/domain/order-pricing';
import { formatPesos } from '../../product-orders/domain/order-text';
import { ALLOWED_PAYMENTS } from '../../product-orders/domain/order-fulfillment';

type Fulfillment = 'DOMICILIO' | 'RECOGER';
type Payment = 'TRANSFERENCIA' | 'CONTRAENTREGA' | 'EN_TIENDA';

export interface FulfillmentSettings {
  deliveryInfo: string | null;
  pickupAddress: string | null;
  paymentMethods: string | null;
}

export interface PurchaseDetails {
  entrega?: Fulfillment;
  pago?: Payment;
  direccion?: string;
}

const DELIVERY_OPTION = (info: string) =>
  `🛵 Te lo enviamos a tu casa (${info})`;
const PICKUP_OPTION = (address: string | null) =>
  `🏠 Lo recoges en el spa${address ? ` (${address})` : ''}`;
const PAYMENT_OPTION: Record<Payment, string> = {
  TRANSFERENCIA: '💳 Transferencia o Nequi, y me envías aquí el comprobante',
  CONTRAENTREGA: '💵 En efectivo cuando lo recibas',
  EN_TIENDA: '💵 En el spa cuando lo recojas',
};

export function deliveryOptions(settings: FulfillmentSettings): string[] {
  return [
    ...(settings.deliveryInfo ? [DELIVERY_OPTION(settings.deliveryInfo)] : []),
    PICKUP_OPTION(settings.pickupAddress),
  ];
}

export function paymentOptions(entrega?: Fulfillment): string[] {
  const allowed: readonly Payment[] = entrega
    ? ALLOWED_PAYMENTS[entrega]
    : ['TRANSFERENCIA', 'CONTRAENTREGA', 'EN_TIENDA'];
  return allowed.map((payment) =>
    entrega || payment === 'TRANSFERENCIA'
      ? PAYMENT_OPTION[payment]
      : `${PAYMENT_OPTION[payment]} (${payment === 'CONTRAENTREGA' ? 'si te lo enviamos' : 'si lo recoges'})`,
  );
}

export function missingDetails(
  details: PurchaseDetails,
  settings: FulfillmentSettings,
): { missing: string[]; problem: string | null } {
  if (details.entrega === 'DOMICILIO' && !settings.deliveryInfo) {
    return {
      missing: ['entrega'],
      problem:
        'Por ahora no hay envíos a domicilio: solo se puede recoger en el spa.',
    };
  }
  if (
    details.entrega &&
    details.pago &&
    !ALLOWED_PAYMENTS[details.entrega].includes(details.pago)
  ) {
    return {
      missing: ['pago'],
      problem:
        details.entrega === 'DOMICILIO'
          ? 'A domicilio se paga por transferencia o en efectivo al recibirlo, no en el spa.'
          : 'Si lo recoge en el spa, paga por transferencia o allá mismo; contraentrega es solo para envíos.',
    };
  }
  const missing = [
    ...(details.entrega ? [] : ['entrega']),
    ...(details.entrega === 'DOMICILIO' && !details.direccion?.trim()
      ? ['direccion']
      : []),
    ...(details.pago ? [] : ['pago']),
  ];
  return { missing, problem: null };
}

export const DETAILS_MISSING_HINT =
  'Todavía NO se registró el pedido. En un solo mensaje dale el resumen (cada producto con su precio y el total, tal como vienen) y pregúntale todo lo que dice faltan, con las opciones de opcionesEntrega y opcionesPago, una por línea (si falta la dirección, pídele la dirección completa con barrio). Si trae problema, explícaselo primero en una frase. Cuando responda, llama otra vez a solicitar_compra_producto con los mismos productos más entrega, pago y direccion. No digas que el pedido quedó registrado.';

export const ORDER_READY_HINT =
  'Dile en un solo mensaje: el pedido con su código, cada producto con su precio (con promoción si la trae) y el total (si trae promotionValidUntil, que el precio con promoción aplica si paga antes de esa fecha); luego cómo pagar, copiando paymentInstructions tal cual, y que te envíe por aquí la foto del comprobante. Si paymentInstructions viene vacío, dile que el equipo le enviará los datos de pago. No digas que está pagado. Cuando llegue la foto del comprobante, llama registrar_pago_pedido en ese mismo turno; nunca digas que lo registraste si esa herramienta no respondió received.';

export const ORDER_MISSING_HINT =
  'Al pedido le falta un dato: pregunta en una sola frase lo que indica missing (la presentación entre options, o cuál producto es). Cuando responda, llama otra vez a solicitar_compra_producto con el pedido completo. No inventes precios.';

export const PAYMENT_RECEIVED_HINT =
  'Agradécele en una o dos líneas: el equipo verifica el pago de ese pedido y le escribe por aquí para coordinar la entrega o la recogida. Nunca digas que el pago quedó confirmado.';

export const PAYMENT_SHORT_HINT =
  'El monto del comprobante es menor que el total del pedido: díselo con amabilidad, con ambos valores, y que el equipo lo revisará. No lo acuses de nada.';

export const PROMOTION_ENDED_HINT =
  'La promoción del pedido terminó antes de que llegara el comprobante, así que el total ahora es el precio normal (total; antes previousTotal): díselo con amabilidad y que el equipo revisará su pago.';

export const NO_OPEN_ORDER_HINT =
  'Esta clienta no tiene un pedido de productos abierto. Si el comprobante es del anticipo de una cita (depositos_pendientes), usa registrar_comprobante_automatico. Si es de productos, pregúntale en una frase qué productos pagó y crea el pedido con solicitar_compra_producto antes de registrar el pago.';

const HOLD_FORMAT = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

interface OrderLike {
  number: number;
  status: string;
  priceHeldUntil: Date | null;
}

export function orderSummary(priced: PricedOrder) {
  return {
    items: priced.items.map((item) => ({
      producto: item.productName,
      presentacion: item.presentation,
      cantidad: item.quantity,
      precio: item.unitPrice === null ? null : formatPesos(item.unitPrice),
      precioPromocion:
        item.promoPrice === null ? null : formatPesos(item.promoPrice),
      promocion: item.promotion,
    })),
    total: priced.total === null ? null : formatPesos(priced.total),
  };
}

export function missingItems(priced: PricedOrder) {
  return priced.items
    .filter((item) => item.missing)
    .map((item) => ({
      producto: item.productName,
      falta: item.missing === 'PRESENTATION' ? 'presentación' : 'producto',
      options: item.options,
    }));
}

export function readyHint(
  details: Required<Pick<PurchaseDetails, 'entrega' | 'pago'>> &
    Pick<PurchaseDetails, 'direccion'>,
  settings: FulfillmentSettings,
): string {
  const where =
    details.entrega === 'DOMICILIO'
      ? `se lo llevamos a ${details.direccion ?? 'su dirección'}`
      : `lo recoge en el spa${settings.pickupAddress ? ` (${settings.pickupAddress})` : ''}`;
  if (details.pago === 'TRANSFERENCIA') {
    return `${ORDER_READY_HINT} Dile también que, cuando el equipo verifique el pago, ${where} y le avisamos por aquí.`;
  }
  const pay =
    details.pago === 'CONTRAENTREGA'
      ? 'paga en efectivo al recibirlo'
      : 'lo paga allá al recogerlo';
  return `Dile en un solo mensaje: el pedido con su código, cada producto con su precio y el total; que ${where} y ${pay}; y que el equipo lo confirma y le avisa por aquí cuando esté listo. No le pidas comprobante ni le des datos de pago.`;
}

export function toBotOrder(
  order: OrderLike,
  priced: PricedOrder,
  paymentInstructions: string | null,
) {
  const missing = priced.items
    .filter((item) => item.missing)
    .map((item) => ({
      producto: item.productName,
      falta: item.missing === 'PRESENTATION' ? 'presentación' : 'producto',
      options: item.options,
    }));
  return {
    orderCode: orderCode(order.number),
    items: priced.items.map((item) => ({
      producto: item.productName,
      presentacion: item.presentation,
      cantidad: item.quantity,
      precio: item.unitPrice === null ? null : formatPesos(item.unitPrice),
      precioPromocion:
        item.promoPrice === null ? null : formatPesos(item.promoPrice),
      promocion: item.promotion,
    })),
    total: priced.total === null ? null : formatPesos(priced.total),
    promotionValidUntil: order.priceHeldUntil
      ? HOLD_FORMAT.format(order.priceHeldUntil)
      : null,
    paymentInstructions: missing.length === 0 ? paymentInstructions : null,
    ...(missing.length > 0 && { missing }),
    hint: missing.length > 0 ? ORDER_MISSING_HINT : ORDER_READY_HINT,
  };
}
