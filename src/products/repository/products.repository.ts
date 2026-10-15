import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  CatalogStatusFilter,
  isActiveWhere,
} from '../../catalog/common/catalog-filters';
import { CreateProductCategoryDto } from '../dto/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/update-product-category.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';
import { CreateProductTagDto } from '../dto/create-product-tag.dto';
import { UpdateProductTagDto } from '../dto/update-product-tag.dto';

const productWithRelationsArgs = {
  include: {
    variants: true,
    category: { select: { id: true, name: true } },
    tagAssignments: { include: { tag: true } },
  },
} satisfies Prisma.ProductDefaultArgs;

export type ProductWithRelations = Prisma.ProductGetPayload<
  typeof productWithRelationsArgs
>;

const adminProductArgs = {
  include: {
    variants: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    category: { select: { id: true, name: true, isActive: true } },
    tagAssignments: {
      include: { tag: { select: { id: true, name: true, isActive: true } } },
      orderBy: { tag: { name: 'asc' } },
    },
    _count: { select: { viewLogs: true, recommendations: true } },
  },
} satisfies Prisma.ProductDefaultArgs;

const adminProductDetailArgs = {
  include: {
    ...adminProductArgs.include,
    recommendations: {
      select: {
        id: true,
        createdAt: true,
        treatment: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    },
  },
} satisfies Prisma.ProductDefaultArgs;

export interface AdminProductsFilter {
  q?: string;
  productCategoryId?: string;
  status: CatalogStatusFilter;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllCategories() {
    return this.prisma.client.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findAllCategoriesForAdmin() {
    return this.prisma.client.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  findCategoryByName(name: string) {
    return this.prisma.client.productCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  findCategoryById(id: string) {
    return this.prisma.client.productCategory.findUnique({ where: { id } });
  }

  createCategory(dto: CreateProductCategoryDto & { slug: string }) {
    return this.prisma.client.productCategory.create({ data: dto });
  }

  async isCategorySlugTaken(slug: string) {
    const found = await this.prisma.client.productCategory.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  async isProductSlugTaken(slug: string) {
    const found = await this.prisma.client.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  async isTagSlugTaken(slug: string) {
    const found = await this.prisma.client.productTag.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  updateCategory(id: string, dto: UpdateProductCategoryDto) {
    return this.prisma.client.productCategory.update({
      where: { id },
      data: dto,
    });
  }

  countProductsInCategory(productCategoryId: string) {
    return this.prisma.client.product.count({ where: { productCategoryId } });
  }

  deleteCategory(id: string) {
    return this.prisma.client.productCategory.delete({ where: { id } });
  }

  findAllActiveProducts() {
    return this.prisma.client.product.findMany({
      where: { isActive: true },
      ...productWithRelationsArgs,
      orderBy: { name: 'asc' },
    });
  }

  findAdminProducts(filter: AdminProductsFilter) {
    const where: Prisma.ProductWhereInput = {
      ...isActiveWhere(filter.status),
      ...(filter.productCategoryId
        ? { productCategoryId: filter.productCategoryId }
        : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { description: { contains: filter.q, mode: 'insensitive' } },
              {
                variants: {
                  some: {
                    OR: [
                      { brand: { contains: filter.q, mode: 'insensitive' } },
                      {
                        presentation: {
                          contains: filter.q,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    return this.prisma.client.product.findMany({
      where,
      ...adminProductArgs,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  findAdminProductById(id: string) {
    return this.prisma.client.product.findUnique({
      where: { id },
      ...adminProductDetailArgs,
    });
  }

  findProductById(id: string) {
    return this.prisma.client.product.findUnique({
      where: { id },
      include: {
        variants: { where: { isActive: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  findProductBasic(id: string) {
    return this.prisma.client.product.findUnique({ where: { id } });
  }

  createProduct(dto: CreateProductDto & { slug: string }) {
    const { tagIds, variants, ...product } = dto;
    return this.prisma.client.product.create({
      data: {
        ...product,
        variants: variants?.length ? { create: variants } : undefined,
        tagAssignments: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      ...adminProductArgs,
    });
  }

  updateProduct(id: string, dto: UpdateProductDto) {
    return this.prisma.client.product.update({
      where: { id },
      data: dto,
      ...adminProductArgs,
    });
  }

  toggleActive(id: string, isActive: boolean) {
    return this.prisma.client.product.update({
      where: { id },
      data: { isActive },
      ...adminProductArgs,
    });
  }

  countProductHistory(productId: string) {
    return this.prisma.client.product.findUnique({
      where: { id: productId },
      select: { _count: { select: { viewLogs: true, recommendations: true } } },
    });
  }

  async deleteProduct(productId: string): Promise<string[]> {
    return this.prisma.client.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({
        where: { productId, imagePublicId: { not: null } },
        select: { imagePublicId: true },
      });
      await tx.productTagAssignment.deleteMany({ where: { productId } });
      await tx.productVariant.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
      return variants.flatMap((v) =>
        v.imagePublicId ? [v.imagePublicId] : [],
      );
    });
  }

  findVariantById(id: string) {
    return this.prisma.client.productVariant.findUnique({ where: { id } });
  }

  findVariantByProductBrandPresentation(
    productId: string,
    brand: string,
    presentation: string,
  ) {
    return this.prisma.client.productVariant.findFirst({
      where: {
        productId,
        brand: { equals: brand, mode: 'insensitive' },
        presentation: { equals: presentation, mode: 'insensitive' },
      },
    });
  }

  createVariant(productId: string, dto: CreateProductVariantDto) {
    return this.prisma.client.productVariant.create({
      data: { ...dto, productId },
    });
  }

  updateVariant(
    id: string,
    data: UpdateProductVariantDto & { imagePublicId?: string | null },
  ) {
    return this.prisma.client.productVariant.update({ where: { id }, data });
  }

  setVariantImage(
    id: string,
    imageUrl: string | null,
    imagePublicId: string | null,
  ) {
    return this.prisma.client.productVariant.update({
      where: { id },
      data: { imageUrl, imagePublicId },
    });
  }

  deleteVariant(id: string) {
    return this.prisma.client.productVariant.delete({ where: { id } });
  }

  findRecommendationsForTreatment(treatmentId: string) {
    return this.prisma.client.treatmentProductRecommendation.findMany({
      where: { treatmentId, product: { isActive: true } },
      include: {
        product: { include: { variants: { where: { isActive: true } } } },
      },
    });
  }

  findTreatmentIdsRecommending(productId: string) {
    return this.prisma.client.treatmentProductRecommendation
      .findMany({ where: { productId }, select: { treatmentId: true } })
      .then((rows) => rows.map((row) => row.treatmentId));
  }

  async treatmentExists(treatmentId: string) {
    const treatment = await this.prisma.client.treatment.findUnique({
      where: { id: treatmentId },
      select: { id: true },
    });
    return treatment !== null;
  }

  findRecommendationById(id: string) {
    return this.prisma.client.treatmentProductRecommendation.findUnique({
      where: { id },
    });
  }

  findRecommendation(treatmentId: string, productId: string) {
    return this.prisma.client.treatmentProductRecommendation.findUnique({
      where: { treatmentId_productId: { treatmentId, productId } },
    });
  }

  createRecommendation(treatmentId: string, productId: string) {
    return this.prisma.client.treatmentProductRecommendation.create({
      data: { treatmentId, productId },
    });
  }

  deleteRecommendation(id: string) {
    return this.prisma.client.treatmentProductRecommendation.delete({
      where: { id },
    });
  }

  findAllTags() {
    return this.prisma.client.productTag.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findAllTagsForAdmin() {
    return this.prisma.client.productTag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
  }

  findTagById(id: string) {
    return this.prisma.client.productTag.findUnique({ where: { id } });
  }

  findTagByName(name: string) {
    return this.prisma.client.productTag.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  countTagsByIds(ids: string[]) {
    return this.prisma.client.productTag.count({ where: { id: { in: ids } } });
  }

  createTag(dto: CreateProductTagDto & { slug: string }) {
    return this.prisma.client.productTag.create({ data: dto });
  }

  updateTag(id: string, dto: UpdateProductTagDto) {
    return this.prisma.client.productTag.update({ where: { id }, data: dto });
  }

  deleteTag(id: string) {
    return this.prisma.client.$transaction([
      this.prisma.client.productTagAssignment.deleteMany({
        where: { tagId: id },
      }),
      this.prisma.client.productTag.delete({ where: { id } }),
    ]);
  }

  replaceProductTags(productId: string, tagIds: string[]) {
    return this.prisma.client.$transaction([
      this.prisma.client.productTagAssignment.deleteMany({
        where: { productId },
      }),
      this.prisma.client.productTagAssignment.createMany({
        data: tagIds.map((tagId) => ({ productId, tagId })),
      }),
    ]);
  }

  async findRelatedByTags(productId: string, limit = 6) {
    const sourceTags = await this.prisma.client.productTagAssignment.findMany({
      where: { productId },
      select: { tagId: true },
    });
    const tagIds = sourceTags.map((t) => t.tagId);
    if (tagIds.length === 0) return [];

    const grouped = await this.prisma.client.productTagAssignment.groupBy({
      by: ['productId'],
      where: {
        tagId: { in: tagIds },
        productId: { not: productId },
        product: { isActive: true },
      },
      _count: { tagId: true },
      orderBy: { _count: { tagId: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) return [];

    const products = await this.prisma.client.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      include: {
        variants: { where: { isActive: true } },
        category: { select: { id: true, name: true } },
      },
    });

    const order = new Map(grouped.map((g, i) => [g.productId, i]));
    return products.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }

  logView(clientId: string, productId: string) {
    return this.prisma.client.productViewLog.create({
      data: { clientId, productId },
    });
  }

  async findMostViewedProductIds(
    clientId: string,
    limit = 5,
  ): Promise<string[]> {
    const grouped = await this.prisma.client.productViewLog.groupBy({
      by: ['productId'],
      where: { clientId },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => g.productId);
  }
}
