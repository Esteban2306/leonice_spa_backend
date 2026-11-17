import type { AdminProductRecord } from '../repository/products.repository';
import {
  computeRitualPricing,
  isRitualComplete,
  RitualPricing,
} from './ritual-pricing';

export interface AdminRitualItemView {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  brand: string;
  presentation: string;
  quantity: number;
  unitPricePesos: number;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface AdminRitualView extends RitualPricing {
  isComplete: boolean;
  items: AdminRitualItemView[];
}

export function toAdminRitualView(
  product: Pick<AdminProductRecord, 'kind' | 'variants' | 'comboItems'>,
): AdminRitualView | null {
  if (product.kind !== 'COMBO') return null;
  const price = Number(product.variants[0]?.price ?? 0);
  const items = product.comboItems.map(({ quantity, variant }) => ({
    variantId: variant.id,
    productId: variant.product.id,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    brand: variant.brand,
    presentation: variant.presentation,
    quantity,
    unitPricePesos: Number(variant.price),
    imageUrl: variant.imageUrl,
    isAvailable:
      variant.isActive &&
      variant.product.isActive &&
      variant.product.category.isActive,
  }));
  return {
    ...computeRitualPricing(
      price,
      items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPricePesos,
      })),
    ),
    isComplete: isRitualComplete(product.comboItems),
    items,
  };
}

export function includedInRituals(
  product: Pick<AdminProductRecord, 'variants'>,
): { id: string; name: string; slug: string }[] {
  const rituals = new Map<string, { id: string; name: string; slug: string }>();
  for (const variant of product.variants)
    for (const { combo } of variant.comboItems) rituals.set(combo.id, combo);
  return [...rituals.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'es'),
  );
}

export function toAdminProductView<T extends AdminProductRecord>(product: T) {
  return {
    ...product,
    ritual: toAdminRitualView(product),
    includedInRituals: includedInRituals(product),
  };
}
