import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

export interface FindPromotionsFilters {
  name?: string;
  treatmentId?: string;
  categoryId?: string;
  isActive?: boolean;
  currentlyValid?: boolean;
}

interface CreatePromotionData {
  name: string;
  discountPercentage: number;
  startsAt: Date;
  endsAt: Date;
  treatmentId?: string;
  categoryId?: string;
}

@Injectable()
export class PromotionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filters: FindPromotionsFilters) {
    const now = new Date();
    const where: Prisma.PromotionWhereInput = {
      ...(filters.name
        ? { name: { contains: filters.name, mode: 'insensitive' } }
        : {}),
      ...(filters.treatmentId ? { treatmentId: filters.treatmentId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.currentlyValid
        ? { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } }
        : {}),
    };

    return this.prisma.client.promotion.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      include: {
        treatment: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.client.promotion.findUnique({
      where: { id },
      include: {
        treatment: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  create(data: CreatePromotionData) {
    return this.prisma.client.promotion.create({ data });
  }

  update(id: string, data: Prisma.PromotionUpdateInput) {
    return this.prisma.client.promotion.update({ where: { id }, data });
  }
}
