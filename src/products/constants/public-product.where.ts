import { Prisma, ProductKind } from '@prisma/client';

const availableComponent = {
  variant: {
    isActive: true,
    product: { isActive: true, category: { isActive: true } },
  },
} satisfies Prisma.ProductComboItemWhereInput;

export const COMPLETE_RITUAL_OR_SINGLE = {
  OR: [
    { kind: ProductKind.SINGLE },
    {
      kind: ProductKind.COMBO,
      comboItems: { some: {}, every: availableComponent },
    },
  ],
} satisfies Prisma.ProductWhereInput;

export const PUBLIC_PRODUCT_WHERE = {
  isActive: true,
  category: { isActive: true },
  ...COMPLETE_RITUAL_OR_SINGLE,
} satisfies Prisma.ProductWhereInput;
