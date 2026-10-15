import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { HairColor, HairLength, Prisma } from '@prisma/client';
import {
  FindAdminTreatmentsQueryDto,
  TreatmentSortField,
} from './dto/find-admin-treatments-query.dto';
import { isActiveWhere } from '../common/catalog-filters';

const treatmentWithRelationsArgs = {
  include: {
    category: { select: { id: true, name: true, slug: true } },
    hairLengthPricing: true,
    hairColorSurcharges: true,
  },
} satisfies Prisma.TreatmentDefaultArgs;

export type TreatmentWithRelations = Prisma.TreatmentGetPayload<
  typeof treatmentWithRelationsArgs
>;

const adminTreatmentArgs = {
  include: {
    ...treatmentWithRelationsArgs.include,
    _count: { select: { reservations: true } },
  },
} satisfies Prisma.TreatmentDefaultArgs;

export type AdminTreatmentRecord = Prisma.TreatmentGetPayload<
  typeof adminTreatmentArgs
>;

function rangeOverlapWhere(
  minField: 'basePriceMin' | 'baseDurationMinMinutes',
  maxField: 'basePriceMax' | 'baseDurationMaxMinutes',
  lower?: number,
  upper?: number,
): Prisma.TreatmentWhereInput[] {
  const conditions: Prisma.TreatmentWhereInput[] = [];
  if (lower !== undefined) {
    conditions.push({
      OR: [
        { [maxField]: { gte: lower } },
        { [maxField]: null, [minField]: { gte: lower } },
      ],
    });
  }
  if (upper !== undefined) {
    conditions.push({
      OR: [
        { [minField]: { lte: upper } },
        { [minField]: null, [maxField]: { lte: upper } },
      ],
    });
  }
  return conditions;
}

function hasPriceWhere(hasPrice?: boolean): Prisma.TreatmentWhereInput[] {
  if (hasPrice === undefined) return [];
  if (hasPrice) {
    return [
      {
        OR: [{ basePriceMin: { not: null } }, { basePriceMax: { not: null } }],
      },
    ];
  }
  return [{ basePriceMin: null, basePriceMax: null }];
}

function adminTreatmentOrder(
  query: FindAdminTreatmentsQueryDto,
): Prisma.TreatmentOrderByWithRelationInput[] {
  const sort = query.sortOrder;
  const tieBreaker = { name: 'asc' } as const;
  switch (query.sortBy) {
    case TreatmentSortField.PRICE:
      return [{ basePriceMin: { sort, nulls: 'last' } }, tieBreaker];
    case TreatmentSortField.DURATION:
      return [{ baseDurationMinMinutes: { sort, nulls: 'last' } }, tieBreaker];
    case TreatmentSortField.CREATED_AT:
      return [{ createdAt: sort }, tieBreaker];
    case TreatmentSortField.UPDATED_AT:
      return [{ updatedAt: sort }, tieBreaker];
    default:
      return [{ name: sort }];
  }
}

@Injectable()
export class TreatmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.client.treatment.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      ...treatmentWithRelationsArgs,
    });
  }

  findForAdmin(query: FindAdminTreatmentsQueryDto) {
    const where: Prisma.TreatmentWhereInput = {
      ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...isActiveWhere(query.status),
      ...(query.requiresPriorAssessment !== undefined && {
        requiresPriorAssessment: query.requiresPriorAssessment,
      }),
      ...(query.hasHairVariablePricing !== undefined && {
        hasHairVariablePricing: query.hasHairVariablePricing,
      }),
      AND: [
        ...hasPriceWhere(query.hasPrice),
        ...rangeOverlapWhere(
          'basePriceMin',
          'basePriceMax',
          query.priceMin,
          query.priceMax,
        ),
        ...rangeOverlapWhere(
          'baseDurationMinMinutes',
          'baseDurationMaxMinutes',
          query.durationMin,
          query.durationMax,
        ),
      ],
    };

    return this.prisma.client.treatment.findMany({
      where,
      orderBy: adminTreatmentOrder(query),
      ...adminTreatmentArgs,
    });
  }

  findById(id: string) {
    return this.prisma.client.treatment.findUnique({
      where: { id },
      ...treatmentWithRelationsArgs,
    });
  }

  findByCategoryAndName(categoryId: string, name: string) {
    return this.prisma.client.treatment.findUnique({
      where: { categoryId_name: { categoryId, name } },
    });
  }

  async isSlugTaken(categoryId: string, slug: string) {
    const found = await this.prisma.client.treatment.findUnique({
      where: { categoryId_slug: { categoryId, slug } },
      select: { id: true },
    });
    return found !== null;
  }

  create(dto: CreateTreatmentDto & { slug: string }) {
    return this.prisma.client.treatment.create({ data: dto });
  }

  setVideo(
    id: string,
    video: { videoUrl: string; posterUrl: string; videoPublicId: string },
  ) {
    return this.prisma.client.treatment.update({
      where: { id },
      data: video,
    });
  }

  clearVideo(id: string) {
    return this.prisma.client.treatment.update({
      where: { id },
      data: { videoUrl: null, posterUrl: null, videoPublicId: null },
    });
  }

  update(id: string, dto: UpdateTreatmentDto) {
    return this.prisma.client.treatment.update({ where: { id }, data: dto });
  }

  async findHairLengthPricing(treatmentId: string) {
    return this.prisma.client.treatmentHairLengthPricing.findMany({
      where: { treatmentId },
    });
  }

  async findHairColorSurcharges(treatmentId: string) {
    return this.prisma.client.treatmentHairColorSurcharge.findMany({
      where: { treatmentId },
    });
  }

  async replaceHairLengthPricing(
    treatmentId: string,
    entries: {
      hairLength: HairLength;
      price: number;
      durationMinutes: number;
    }[],
  ) {
    return this.prisma.client.$transaction([
      this.prisma.client.treatmentHairLengthPricing.deleteMany({
        where: { treatmentId },
      }),
      this.prisma.client.treatmentHairLengthPricing.createMany({
        data: entries.map((e) => ({ treatmentId, ...e })),
      }),
    ]);
  }

  async replaceHairColorSurcharges(
    treatmentId: string,
    entries: {
      hairColor: HairColor;
      surcharge: number;
      extraDurationMinutes: number;
    }[],
  ) {
    return this.prisma.client.$transaction([
      this.prisma.client.treatmentHairColorSurcharge.deleteMany({
        where: { treatmentId },
      }),
      this.prisma.client.treatmentHairColorSurcharge.createMany({
        data: entries.map((e) => ({ treatmentId, ...e })),
      }),
    ]);
  }
}
