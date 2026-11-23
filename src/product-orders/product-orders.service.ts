import { Injectable } from '@nestjs/common';
import { ProductOrderStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { EVENT_TYPES } from '../common/events/constants/event.types';
import { EventBusService } from '../common/events/event.service';
import { BusinessSettingsService } from '../business-settings/business-settings.service';
import { CloudinaryService } from '../infrastructure/cloudinary/cloudinary.service';
import { ProductCatalogService } from '../products/catalog/product-catalog.service';
import { PromotionsService } from '../promotions/promotions.service';
import {
  orderCode,
  parseOrderCode,
  priceHeldUntil,
  priceOrder,
  RequestedItem,
} from './domain/order-pricing';
import { describeItems, formatPesos } from './domain/order-text';
import {
  OrderContact,
  OPEN_ORDER_STATUSES,
  ProductOrderWithItems,
  ProductOrdersRepository,
} from './product-orders.repository';

export interface PlaceOrderInput {
  contact: OrderContact;
  clientId: string | null;
  clientName: string | null;
  items: RequestedItem[];
  request: string | null;
  notes: string | null;
  requestId: string;
}

export interface RegisterPaymentInput {
  contact: OrderContact;
  orderCode?: string | null;
  imageBase64: string;
  amountSeen?: number | null;
}

const CLOSED: ProductOrderStatus[] = [
  ProductOrderStatus.ENTREGADO,
  ProductOrderStatus.CANCELADO,
];

@Injectable()
export class ProductOrdersService {
  constructor(
    private readonly repository: ProductOrdersRepository,
    private readonly catalog: ProductCatalogService,
    private readonly promotions: PromotionsService,
    private readonly businessSettings: BusinessSettingsService,
    private readonly cloudinary: CloudinaryService,
    private readonly eventBus: EventBusService,
  ) {}

  async place(input: PlaceOrderInput) {
    const [catalog, promotions, open] = await Promise.all([
      this.catalog.listRecords(),
      this.promotions.findAllCurrentlyValid(),
      this.repository.findOpen(input.contact, [
        ProductOrderStatus.PENDIENTE_PAGO,
      ]),
    ]);
    const priced = priceOrder(catalog, promotions, input.items);
    const data = {
      request: input.request,
      notes: input.notes,
      total: priced.total,
      priceHeldUntil: priceHeldUntil(priced.items),
      items: priced.items,
    };
    const order = open
      ? await this.repository.replaceItems(open.id, data)
      : await this.repository.create({
          ...data,
          contact: input.contact,
          clientId: input.clientId,
          clientName: input.clientName,
        });

    let teamNotified = true;
    if (!open) {
      const results = await this.eventBus.publishAsync(
        EVENT_TYPES.CONDUIT_PRODUCT_PURCHASE_REQUESTED,
        {
          phone: input.contact.phone,
          lid: input.contact.lid,
          clientName: input.clientName,
          request: this.purchaseNotice(order, input.request),
          notes: input.notes,
          requestId: input.requestId,
        },
      );
      teamNotified = results.some(Boolean);
    }

    const settings = await this.businessSettings.get();
    return {
      order,
      priced,
      created: !open,
      teamNotified,
      paymentInstructions:
        settings.productPaymentInstructions?.trim() ||
        settings.depositInstructions?.trim() ||
        null,
    };
  }

  openOrderFor(contact: OrderContact) {
    return this.repository.findOpen(contact);
  }

  async registerPayment(input: RegisterPaymentInput) {
    const number = parseOrderCode(input.orderCode);
    const byCode = number ? await this.repository.findByNumber(number) : null;
    const order =
      byCode &&
      this.belongsTo(byCode, input.contact) &&
      !CLOSED.includes(byCode.status)
        ? byCode
        : await this.repository.findOpen(input.contact, OPEN_ORDER_STATUSES);
    if (!order) return { order: null } as const;

    const repriced = await this.repriceIfPromotionEnded(order);
    const uploaded = await this.cloudinary.uploadProductPaymentProofFromBase64(
      input.imageBase64,
      order.id,
    );
    const amountSeen =
      typeof input.amountSeen === 'number' && input.amountSeen > 0
        ? Math.round(input.amountSeen)
        : null;
    const updated = await this.repository.update(repriced.order.id, {
      status: ProductOrderStatus.PAGO_EN_REVISION,
      proofImageUrl: uploaded.url,
      proofCloudinaryId: uploaded.publicId,
      proofAmount: amountSeen,
      proofReceivedAt: new Date(),
      rejectionReason: null,
    });
    const total = updated.total === null ? null : Number(updated.total);
    const amountMatches =
      amountSeen === null || total === null ? null : amountSeen >= total;

    await this.eventBus.publishAsync(
      EVENT_TYPES.PRODUCT_ORDER_PAYMENT_RECEIVED,
      {
        orderId: updated.id,
        proofReceivedAt: (updated.proofReceivedAt as Date).toISOString(),
      },
    );
    return {
      order: updated,
      total,
      amountSeen,
      amountMatches,
      previousTotal: repriced.previousTotal,
    } as const;
  }

  private async repriceIfPromotionEnded(
    order: ProductOrderWithItems,
    now: Date = new Date(),
  ): Promise<{ order: ProductOrderWithItems; previousTotal: number | null }> {
    const ended =
      order.status === ProductOrderStatus.PENDIENTE_PAGO &&
      order.priceHeldUntil !== null &&
      order.priceHeldUntil.getTime() < now.getTime();
    if (!ended) return { order, previousTotal: null };
    const [catalog, promotions] = await Promise.all([
      this.catalog.listRecords(),
      this.promotions.findAllCurrentlyValid(),
    ]);
    const priced = priceOrder(
      catalog,
      promotions,
      order.items.map((item) => ({
        product: item.productName,
        presentation: item.presentation,
        quantity: item.quantity,
      })),
    );
    const previousTotal = order.total === null ? null : Number(order.total);
    const updated = await this.repository.replaceItems(order.id, {
      request: order.request,
      notes: order.notes,
      total: priced.total,
      priceHeldUntil: priceHeldUntil(priced.items),
      items: priced.items,
    });
    return {
      order: updated,
      previousTotal: previousTotal === priced.total ? null : previousTotal,
    };
  }

  list(filters: {
    status?: ProductOrderStatus;
    page: number;
    pageSize: number;
  }) {
    return this.repository.list(filters);
  }

  async summary() {
    const counts = await this.repository.countByStatus();
    return {
      counts,
      toVerify: counts.PAGO_EN_REVISION,
      awaitingPayment: counts.PENDIENTE_PAGO,
      toDeliver: counts.PAGADO,
    };
  }

  async verifyPayment(id: string, userId: string) {
    const order = await this.load(id);
    this.assertStatus(order, [
      ProductOrderStatus.PAGO_EN_REVISION,
      ProductOrderStatus.PENDIENTE_PAGO,
    ]);
    const updated = await this.repository.update(id, {
      status: ProductOrderStatus.PAGADO,
      verifiedAt: new Date(),
      verifiedByUserId: userId,
      rejectionReason: null,
    });
    return updated;
  }

  async rejectPayment(id: string, reason: string) {
    const order = await this.load(id);
    this.assertStatus(order, [ProductOrderStatus.PAGO_EN_REVISION]);
    const updated = await this.repository.update(id, {
      status: ProductOrderStatus.PENDIENTE_PAGO,
      rejectionReason: reason,
    });
    this.eventBus.publish(EVENT_TYPES.PRODUCT_ORDER_PAYMENT_REJECTED, {
      orderId: id,
      reason,
    });
    return updated;
  }

  async markDelivered(id: string) {
    const order = await this.load(id);
    this.assertStatus(order, [ProductOrderStatus.PAGADO]);
    return this.repository.update(id, {
      status: ProductOrderStatus.ENTREGADO,
      deliveredAt: new Date(),
    });
  }

  async cancel(id: string) {
    const order = await this.load(id);
    this.assertStatus(order, [
      ProductOrderStatus.PENDIENTE_PAGO,
      ProductOrderStatus.PAGO_EN_REVISION,
      ProductOrderStatus.PAGADO,
    ]);
    return this.repository.update(id, {
      status: ProductOrderStatus.CANCELADO,
      cancelledAt: new Date(),
    });
  }

  async setTotal(id: string, total: number) {
    const order = await this.load(id);
    this.assertStatus(order, OPEN_ORDER_STATUSES);
    return this.repository.update(id, { total });
  }

  load(id: string): Promise<ProductOrderWithItems> {
    return this.repository.findById(id).then((order) => {
      if (!order) throw new AppException('PRODUCT_ORDER_NOT_FOUND');
      return order;
    });
  }

  private belongsTo(order: ProductOrderWithItems, contact: OrderContact) {
    return (
      (contact.phone !== null && order.phone === contact.phone) ||
      (contact.lid !== null && order.lid === contact.lid)
    );
  }

  private assertStatus(
    order: ProductOrderWithItems,
    allowed: readonly ProductOrderStatus[],
  ) {
    if (!allowed.includes(order.status)) {
      throw new AppException('PRODUCT_ORDER_INVALID_STATUS', {
        details: { status: order.status },
      });
    }
  }

  private purchaseNotice(order: ProductOrderWithItems, request: string | null) {
    const total = order.total === null ? null : Number(order.total);
    return [
      `Pedido ${orderCode(order.number)}: ${describeItems(order.items)}`,
      total === null
        ? 'Total: por confirmar (hay productos sin precio o sin presentación)'
        : `Total: ${formatPesos(total)}`,
      request ? `En sus palabras: ${request}` : null,
    ]
      .filter(Boolean)
      .join('. ');
  }
}
