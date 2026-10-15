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
      include: { steps: { orderBy: { position: 'asc' } } },
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
