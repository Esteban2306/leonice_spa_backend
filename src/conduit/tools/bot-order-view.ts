import type { PricedOrder } from '../../product-orders/domain/order-pricing';
import { orderCode } from '../../product-orders/domain/order-pricing';
import { formatPesos } from '../../product-orders/domain/order-text';

export const ORDER_READY_HINT =
  'Dile en un solo mensaje: el pedido con su código, cada producto con su precio (con promoción si la trae) y el total; luego cómo pagar, copiando paymentInstructions tal cual, y que te envíe por aquí la foto del comprobante. Si paymentInstructions viene vacío, dile que el equipo le enviará los datos de pago. No digas que está pagado. Cuando llegue la foto del comprobante, llama registrar_pago_pedido en ese mismo turno; nunca digas que lo registraste si esa herramienta no respondió received.';

export const ORDER_MISSING_HINT =
  'Al pedido le falta un dato: pregunta en una sola frase lo que indica missing (la presentación entre options, o cuál producto es). Cuando responda, llama otra vez a solicitar_compra_producto con el pedido completo. No inventes precios.';

export const PAYMENT_RECEIVED_HINT =
  'Agradécele en una o dos líneas: el equipo verifica el pago de ese pedido y le escribe por aquí para coordinar la entrega o la recogida. Nunca digas que el pago quedó confirmado.';

export const PAYMENT_SHORT_HINT =
  'El monto del comprobante es menor que el total del pedido: díselo con amabilidad, con ambos valores, y que el equipo lo revisará. No lo acuses de nada.';

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
  priceHeldUntil: Date;
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
    priceHeldUntil: HOLD_FORMAT.format(order.priceHeldUntil),
    paymentInstructions: missing.length === 0 ? paymentInstructions : null,
    ...(missing.length > 0 && { missing }),
    hint: missing.length > 0 ? ORDER_MISSING_HINT : ORDER_READY_HINT,
  };
}
