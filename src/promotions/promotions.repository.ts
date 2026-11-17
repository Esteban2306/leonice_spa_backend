import { Injectable } from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  PromotionTarget,
  PromotionValidity,
} from './dto/find-promotions-query.dto';

export interface FindPromotionsFilters {
  name?: string;
  treatmentId?: string;
  categoryId?: string;
  isActive?: boolean;
  currentlyValid?: boolean;
  validity?: PromotionValidity;
  appliesTo?: PromotionTarget;
  withinCategoryId?: string;
}

function validityWhere(
  validity: PromotionValidity | undefined,
  now: Date,
): Prisma.PromotionWhereInput {
  if (validity === PromotionValidity.CURRENT)
    return { startsAt: { lte: now }, endsAt: { gte: now } };
  if (validity === PromotionValidity.UPCOMING) return { startsAt: { gt: now } };
  if (validity === PromotionValidity.EXPIRED) return { endsAt: { lt: now } };
  return {};
}

function targetWhere(
  appliesTo: PromotionTarget | undefined,
): Prisma.PromotionWhereInput {
  if (appliesTo === PromotionTarget.TREATMENT)
    return { treatmentId: { not: null } };
  if (appliesTo === PromotionTarget.CATEGORY)
    return { categoryId: { not: null }, treatmentId: null };
  return {};
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
      AND: [
        validityWhere(filters.validity, now),
        targetWhere(filters.appliesTo),
        filters.withinCategoryId
          ? {
              OR: [
                { categoryId: filters.withinCategoryId },
                { treatment: { categoryId: filters.withinCategoryId } },
              ],
            }
          : {},
      ],
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

  findOverlapping(params: {
    treatmentId?: string | null;
    categoryId?: string | null;
    startsAt: Date;
    endsAt: Date;
    excludeId?: string;
  }) {
    return this.prisma.client.promotion.findFirst({
      where: {
        isActive: true,
        startsAt: { lt: params.endsAt },
        endsAt: { gt: params.startsAt },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
        ...(params.treatmentId
          ? { treatmentId: params.treatmentId }
          : { categoryId: params.categoryId ?? undefined, treatmentId: null }),
      },
      select: { id: true, name: true },
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

  async countBlockingReferences(id: string) {
    const [automationRules, openCampaigns] = await Promise.all([
      this.prisma.client.automationRule.count({ where: { promotionId: id } }),
      this.prisma.client.campaign.count({
        where: {
          promotionId: id,
          status: { in: [CampaignStatus.RUNNING, CampaignStatus.PAUSED] },
        },
      }),
    ]);
    return { automationRules, openCampaigns };
  }

  delete(id: string) {
    return this.prisma.client.promotion.delete({ where: { id } });
  }

  update(id: string, data: Prisma.PromotionUpdateInput) {
    return this.prisma.client.promotion.update({ where: { id }, data });
  }
}
