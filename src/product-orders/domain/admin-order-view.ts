import type { ProductOrderWithItems } from '../product-orders.repository';
import { orderCode } from './order-pricing';

const money = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

export function toAdminOrder(order: ProductOrderWithItems) {
  const total = money(order.total);
  const proofAmount = money(order.proofAmount);
  return {
    id: order.id,
    code: orderCode(order.number),
    status: order.status,
    clientId: order.clientId,
    clientName: order.clientName,
    phone: order.phone,
    lid: order.lid,
    request: order.request,
    notes: order.notes,
    total,
    priceHeldUntil: order.priceHeldUntil,
    proofImageUrl: order.proofImageUrl,
    proofAmount,
    proofReceivedAt: order.proofReceivedAt,
    amountMatches:
      proofAmount === null || total === null ? null : proofAmount >= total,
    rejectionReason: order.rejectionReason,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    deliveryAddress: order.deliveryAddress,
    verifiedAt: order.verifiedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      presentation: item.presentation,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      promoPrice: money(item.promoPrice),
      promotion: item.promotion,
      priced: item.unitPrice !== null,
    })),
  };
}
