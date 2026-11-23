import { Promotion } from '@prisma/client';

export function resolveProductPromotion<
  T extends Pick<Promotion, 'productId' | 'productCategoryId'>,
>(
  promotions: readonly T[],
  product: { id: string; productCategoryId: string },
): T | null {
  return (
    promotions.find((p) => p.productId === product.id) ??
    promotions.find(
      (p) => p.productCategoryId === product.productCategoryId && !p.productId,
    ) ??
    null
  );
}
