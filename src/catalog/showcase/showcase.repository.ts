import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

const showcaseTreeArgs = {
  where: { isActive: true, showOnWebsite: true },
  orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  include: {
    treatments: {
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        steps: { orderBy: { position: 'asc' } },
        recommendations: {
          where: { product: { isActive: true, category: { isActive: true } } },
          orderBy: { createdAt: 'asc' },
          select: {
            product: {
              select: {
                id: true,
                slug: true,
                name: true,
                tagline: true,
                variants: {
                  where: { isActive: true },
                  orderBy: { price: 'asc' },
                  select: { price: true, imageUrl: true },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CategoryFindManyArgs;

export type ShowcaseCategoryRecord = Prisma.CategoryGetPayload<
  typeof showcaseTreeArgs
>;

export type ShowcaseTreatmentRecord =
  ShowcaseCategoryRecord['treatments'][number];

@Injectable()
export class ShowcaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTree() {
    return this.prisma.client.category.findMany(showcaseTreeArgs);
  }
}
