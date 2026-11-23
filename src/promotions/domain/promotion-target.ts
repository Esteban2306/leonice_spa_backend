export const PROMOTION_TARGET_FIELDS = [
  'treatmentId',
  'categoryId',
  'productId',
  'productCategoryId',
] as const;

export type PromotionTargetField = (typeof PROMOTION_TARGET_FIELDS)[number];

export type PromotionTargetIds = Partial<
  Record<PromotionTargetField, string | null>
>;

export interface PromotionTarget {
  field: PromotionTargetField;
  id: string;
}

export function promotionTargetsOf(ids: PromotionTargetIds): PromotionTarget[] {
  return PROMOTION_TARGET_FIELDS.flatMap((field) => {
    const id = ids[field];
    return id ? [{ field, id }] : [];
  });
}

export function touchesTarget(ids: PromotionTargetIds): boolean {
  return PROMOTION_TARGET_FIELDS.some((field) => ids[field] !== undefined);
}

export function targetColumns(
  target: PromotionTarget,
): Record<PromotionTargetField, string | null> {
  return {
    treatmentId: null,
    categoryId: null,
    productId: null,
    productCategoryId: null,
    [target.field]: target.id,
  };
}
