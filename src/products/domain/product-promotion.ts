import { applyPercentageDiscount } from '../../common/money/percentage-discount';
import { resolveProductPromotion } from '../../promotions/domain/resolve-product-promotion';

export interface ProductPromotionSource {
  name: string;
  discountPercentage: unknown;
  endsAt: Date | string;
  productId: string | null;
  productCategoryId: string | null;
}

export interface ProductPromotionPrice {
  name: string;
  discountPercentage: number;
  endsAt: Date | string;
}

export function discountedPesos(price: number, discountPercentage: number) {
  return Math.round(applyPercentageDiscount(price, discountPercentage));
}

export function productPromotionFor(
  promotions: readonly ProductPromotionSource[],
  product: { id: string; productCategoryId: string },
): ProductPromotionPrice | null {
  const found = resolveProductPromotion(promotions, product);
  if (!found) return null;
  const discountPercentage = Number(found.discountPercentage);
  if (!(discountPercentage > 0 && discountPercentage <= 100)) return null;
  return { name: found.name, discountPercentage, endsAt: found.endsAt };
}
