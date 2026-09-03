import { Promotion } from '@prisma/client';

export function resolveApplicablePromotion(
  promotions: Promotion[],
  target: { treatmentId?: string; categoryId?: string },
): Promotion | null {
  const treatmentMatch = target.treatmentId
    ? promotions.find((p) => p.treatmentId === target.treatmentId)
    : undefined;
  if (treatmentMatch) return treatmentMatch;

  const categoryMatch = target.categoryId
    ? promotions.find(
        (p) => p.categoryId === target.categoryId && !p.treatmentId,
      )
    : undefined;
  return categoryMatch ?? null;
}
