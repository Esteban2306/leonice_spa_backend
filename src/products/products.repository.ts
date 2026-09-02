import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateProductTagDto } from './dto/create-product-tag.dto';
import { Prisma } from '@prisma/client';

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

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Categorías de producto ----

  findAllCategories() {
    return this.prisma.client.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findCategoryByName(name: string) {
    return this.prisma.client.productCategory.findUnique({ where: { name } });
  }

  findCategoryById(id: string) {
    return this.prisma.client.productCategory.findUnique({ where: { id } });
  }

  createCategory(dto: CreateProductCategoryDto) {
    return this.prisma.client.productCategory.create({ data: dto });
  }

  updateCategory(id: string, dto: UpdateProductCategoryDto) {
    return this.prisma.client.productCategory.update({
      where: { id },
      data: dto,
    });
  }

  // ---- Productos ----

  findAllActiveProducts() {
    return this.prisma.client.product.findMany({
      where: { isActive: true },
      ...productWithRelationsArgs,
      orderBy: { name: 'asc' },
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

  createProduct(dto: CreateProductDto) {
    return this.prisma.client.product.create({ data: dto });
  }

  updateProduct(id: string, dto: UpdateProductDto) {
    return this.prisma.client.product.update({ where: { id }, data: dto });
  }

  // ---- Variantes ----

  findVariantById(id: string) {
    return this.prisma.client.productVariant.findUnique({ where: { id } });
  }

  findVariantByProductBrandPresentation(
    productId: string,
    brand: string,
    presentation: string,
  ) {
    return this.prisma.client.productVariant.findUnique({
      where: {
        productId_brand_presentation: { productId, brand, presentation },
      },
    });
  }

  createVariant(productId: string, dto: CreateProductVariantDto) {
    return this.prisma.client.productVariant.create({
      data: { ...dto, productId },
    });
  }

  updateVariant(id: string, dto: UpdateProductVariantDto) {
    return this.prisma.client.productVariant.update({
      where: { id },
      data: dto,
    });
  }

  // ---- Recomendaciones ----

  findRecommendationsForTreatment(treatmentId: string) {
    return this.prisma.client.treatmentProductRecommendation.findMany({
      where: { treatmentId },
      include: {
        product: { include: { variants: { where: { isActive: true } } } },
      },
    });
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

  // ---- Toggle ----
  toggleActive(id: string, isActive: boolean) {
    return this.prisma.client.product.update({
      where: { id },
      data: { isActive },
    });
  }

  // ---- Tags ----
  findAllTags() {
    return this.prisma.client.productTag.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
  findTagByName(name: string) {
    return this.prisma.client.productTag.findUnique({ where: { name } });
  }
  createTag(dto: CreateProductTagDto) {
    return this.prisma.client.productTag.create({ data: dto });
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
