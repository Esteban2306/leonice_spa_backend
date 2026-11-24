import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductFulfillment,
  ProductOrderStatus,
  ProductPaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import type { PricedItem } from './domain/order-pricing';

export const OPEN_ORDER_STATUSES: ProductOrderStatus[] = [
  ProductOrderStatus.PENDIENTE_PAGO,
  ProductOrderStatus.PAGO_EN_REVISION,
];

export const OPEN_ORDER_MAX_AGE_DAYS = 7;

export const TO_VERIFY_STATUSES: ProductOrderStatus[] = OPEN_ORDER_STATUSES;

export interface OrderFulfillment {
  fulfillment: ProductFulfillment | null;
  paymentMethod: ProductPaymentMethod | null;
  deliveryAddress: string | null;
}

export const orderInclude = {
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductOrderInclude;

export type ProductOrderWithItems = Prisma.ProductOrderGetPayload<{
  include: typeof orderInclude;
}>;

export interface OrderContact {
  phone: string | null;
  lid: string | null;
}

export interface OrderListFilters {
  status?: ProductOrderStatus;
  statuses?: readonly ProductOrderStatus[];
  clientId?: string;
  phone?: string;
  page: number;
  pageSize: number;
}

const itemRows = (items: readonly PricedItem[]) =>
  items.map((item, position) => ({
    variantId: item.variantId,
    productName: item.productName,
    presentation: item.presentation,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    promoPrice: item.promoPrice,
    promotion: item.promotion,
    position,
  }));

function contactWhere(contact: OrderContact): Prisma.ProductOrderWhereInput {
  if (contact.phone) return { phone: contact.phone };
  if (contact.lid) return { lid: contact.lid };
  return { id: '__ninguno__' };
}

@Injectable()
export class ProductOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOpen(
    contact: OrderContact,
    statuses: ProductOrderStatus[] = OPEN_ORDER_STATUSES,
    now: Date = new Date(),
  ): Promise<ProductOrderWithItems | null> {
    return this.prisma.client.productOrder.findFirst({
      where: {
        ...contactWhere(contact),
        status: { in: statuses },
        createdAt: {
          gte: new Date(now.getTime() - OPEN_ORDER_MAX_AGE_DAYS * 86_400_000),
        },
      },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async clientPhone(clientId: string): Promise<string | null> {
    const client = await this.prisma.client.client.findUnique({
      where: { id: clientId },
      select: { phone: true },
    });
    return client?.phone ?? null;
  }

  findById(id: string): Promise<ProductOrderWithItems | null> {
    return this.prisma.client.productOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
  }

  findByNumber(number: number): Promise<ProductOrderWithItems | null> {
    return this.prisma.client.productOrder.findUnique({
      where: { number },
      include: orderInclude,
    });
  }

  create(
    data: {
      contact: OrderContact;
      clientId: string | null;
      clientName: string | null;
      request: string | null;
      notes: string | null;
      total: number | null;
      priceHeldUntil: Date | null;
      items: readonly PricedItem[];
    } & Partial<OrderFulfillment>,
  ): Promise<ProductOrderWithItems> {
    return this.prisma.client.productOrder.create({
      data: {
        phone: data.contact.phone,
        lid: data.contact.lid,
        clientId: data.clientId,
        clientName: data.clientName,
        request: data.request,
        notes: data.notes,
        total: data.total,
        priceHeldUntil: data.priceHeldUntil,
        fulfillment: data.fulfillment ?? null,
        paymentMethod: data.paymentMethod ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        items: { create: itemRows(data.items) },
      },
      include: orderInclude,
    });
  }

  replaceItems(
    id: string,
    data: {
      request: string | null;
      notes: string | null;
      total: number | null;
      priceHeldUntil: Date | null;
      items: readonly PricedItem[];
    } & Partial<OrderFulfillment>,
  ): Promise<ProductOrderWithItems> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.productOrderItem.deleteMany({ where: { orderId: id } });
      return tx.productOrder.update({
        where: { id },
        data: {
          request: data.request,
          notes: data.notes,
          total: data.total,
          priceHeldUntil: data.priceHeldUntil,
          ...(data.fulfillment !== undefined && {
            fulfillment: data.fulfillment,
          }),
          ...(data.paymentMethod !== undefined && {
            paymentMethod: data.paymentMethod,
          }),
          ...(data.deliveryAddress !== undefined && {
            deliveryAddress: data.deliveryAddress,
          }),
          status: ProductOrderStatus.PENDIENTE_PAGO,
          items: { create: itemRows(data.items) },
        },
        include: orderInclude,
      });
    });
  }

  update(
    id: string,
    data: Prisma.ProductOrderUncheckedUpdateInput,
  ): Promise<ProductOrderWithItems> {
    return this.prisma.client.productOrder.update({
      where: { id },
      data,
      include: orderInclude,
    });
  }

  async list(filters: OrderListFilters) {
    const statuses = filters.statuses?.length
      ? [...filters.statuses]
      : filters.status
        ? [filters.status]
        : null;
    const owners: Prisma.ProductOrderWhereInput[] = [
      ...(filters.clientId ? [{ clientId: filters.clientId }] : []),
      ...(filters.phone ? [{ phone: filters.phone }] : []),
    ];
    const where: Prisma.ProductOrderWhereInput = {
      ...(statuses && { status: { in: statuses } }),
      ...(owners.length > 0 && { OR: owners }),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.productOrder.findMany({
        where,
        include: orderInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.client.productOrder.count({ where }),
    ]);
    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }

  async countByStatus(): Promise<Record<ProductOrderStatus, number>> {
    const rows = await this.prisma.client.productOrder.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      Object.values(ProductOrderStatus).map((status) => [status, 0]),
    ) as Record<ProductOrderStatus, number>;
    for (const row of rows) counts[row.status] = row._count._all;
    return counts;
  }
}
