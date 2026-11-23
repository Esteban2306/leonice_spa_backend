export interface OrderItemText {
  productName: string;
  presentation: string | null;
  quantity: number;
  unitPrice: unknown;
  promoPrice: unknown;
}

export function formatPesos(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`;
}

const priceOf = (item: OrderItemText) => {
  const value = item.promoPrice ?? item.unitPrice;
  return value === null || value === undefined ? null : Number(value);
};

export function describeItem(item: OrderItemText): string {
  const presentation = item.presentation ? ` (${item.presentation})` : '';
  const price = priceOf(item);
  return `${item.quantity} × ${item.productName}${presentation}${
    price === null ? ' — sin precio' : ` a ${formatPesos(price)}`
  }`;
}

export function describeItems(items: readonly OrderItemText[]): string {
  return items.length === 0
    ? 'sin productos'
    : items.map(describeItem).join('; ');
}
