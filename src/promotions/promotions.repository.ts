import { Injectable } from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  PromotionDomain,
  PromotionTarget,
  PromotionValidity,
} from './dto/find-promotions-query.dto';
import {
  PromotionTarget as TargetRef,
  PromotionTargetField,
} from './domain/promotion-target';

export interface FindPromotionsFilters {
  name?: string;
  treatmentId?: string;
  categoryId?: string;
  isActive?: boolean;
  currentlyValid?: boolean;
  validity?: PromotionValidity;
  appliesTo?: PromotionTarget;
  withinCategoryId?: string;
  productId?: string;
  productCategoryId?: string;
  domain?: PromotionDomain;
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
  if (appliesTo === PromotionTarget.PRODUCT)
    return { productId: { not: null } };
  if (appliesTo === PromotionTarget.PRODUCT_CATEGORY)
    return { productCategoryId: { not: null }, productId: null };
  return {};
}

function domainWhere(
  domain: PromotionDomain | undefined,
): Prisma.PromotionWhereInput {
  if (domain === PromotionDomain.SERVICES)
    return { productId: null, productCategoryId: null };
  if (domain === PromotionDomain.PRODUCTS)
    return {
      OR: [{ productId: { not: null } }, { productCategoryId: { not: null } }],
    };
  return {};
}

const promotionInclude = {
  treatment: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  product: {
    select: { id: true, name: true, kind: true, productCategoryId: true },
  },
  productCategory: { select: { id: true, name: true } },
} satisfies Prisma.PromotionInclude;

type CreatePromotionData = {
  name: string;
  discountPercentage: number;
  startsAt: Date;
  endsAt: Date;
} & Record<PromotionTargetField, string | null>;

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
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.productCategoryId
        ? { productCategoryId: filters.productCategoryId }
        : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.currentlyValid
        ? { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } }
        : {}),
      AND: [
        validityWhere(filters.validity, now),
        targetWhere(filters.appliesTo),
        domainWhere(filters.domain),
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
      include: promotionInclude,
    });
  }

  findOverlapping(params: {
    target: TargetRef;
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
        [params.target.field]: params.target.id,
      },
      select: { id: true, name: true },
    });
  }

  async targetExists(target: TargetRef): Promise<boolean> {
    const where = { where: { id: target.id }, select: { id: true } };
    const found =
      target.field === 'treatmentId'
        ? await this.prisma.client.treatment.findUnique(where)
        : target.field === 'categoryId'
          ? await this.prisma.client.category.findUnique(where)
          : target.field === 'productId'
            ? await this.prisma.client.product.findUnique(where)
            : await this.prisma.client.productCategory.findUnique(where);
    return found !== null;
  }

  findById(id: string) {
    return this.prisma.client.promotion.findUnique({
      where: { id },
      include: promotionInclude,
    });
  }

  create(data: CreatePromotionData) {
    return this.prisma.client.promotion.create({
      data,
      include: promotionInclude,
    });
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

  update(id: string, data: Prisma.PromotionUncheckedUpdateInput) {
    return this.prisma.client.promotion.update({
      where: { id },
      data,
      include: promotionInclude,
    });
  }
}
