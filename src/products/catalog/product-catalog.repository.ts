import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

const catalogProductArgs = {
  where: { isActive: true, category: { isActive: true } },
  orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  include: {
    variants: {
      where: { isActive: true },
      orderBy: [{ price: 'asc' }, { presentation: 'asc' }],
    },
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconKey: true,
        displayOrder: true,
      },
    },
    tagAssignments: {
      where: { tag: { isActive: true } },
      include: { tag: { select: { id: true, name: true, slug: true } } },
      orderBy: { tag: { name: 'asc' } },
    },
    recommendations: {
      where: {
        treatment: {
          isActive: true,
          category: { isActive: true, showOnWebsite: true },
        },
      },
      select: {
        treatment: {
          select: {
            id: true,
            name: true,
            slug: true,
            tagline: true,
            category: { select: { slug: true, name: true } },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductFindManyArgs;

export type CatalogProductRecord = Prisma.ProductGetPayload<
  typeof catalogProductArgs
>;

@Injectable()
export class ProductCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCatalog() {
    return this.prisma.client.product.findMany(catalogProductArgs);
  }
}
