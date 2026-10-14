import { Injectable, Logger } from '@nestjs/common';
import {
  ProductsRepository,
  ProductWithRelations,
} from './products.repository';
import { SafeCacheService } from '../infrastructure/redis/safe-cache.service';
import { CloudinaryService } from '../infrastructure/cloudinary/cloudinary.service';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from 'src/catalog/constants/catalog-cache.constants';
import { AppException } from '../common/errors/app.exception';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { FindAdminProductsQueryDto } from './dto/find-admin-products-query.dto';
import { ClientsRepository } from 'src/clients/repositories/clients.repository';
import { CreateProductTagDto } from './dto/create-product-tag.dto';
import { UpdateProductTagDto } from './dto/update-product-tag.dto';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';

function variantKey(brand: string, presentation: string) {
  return `${brand.toLowerCase()}\u0000${presentation.toLowerCase()}`;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly repository: ProductsRepository,
    private readonly cache: SafeCacheService,
    private readonly clientsRepository: ClientsRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  findAllCategories() {
    return this.repository.findAllCategories();
  }

  findAllCategoriesForAdmin() {
    return this.repository.findAllCategoriesForAdmin();
  }

  async createCategory(dto: CreateProductCategoryDto) {
    await this.assertCategoryNameAvailable(dto.name);
    return this.repository.createCategory(dto);
  }

  async updateCategory(id: string, dto: UpdateProductCategoryDto) {
    await this.assertCategoryExists(id);
    if (dto.name !== undefined)
      await this.assertCategoryNameAvailable(dto.name, id);
    const category = await this.repository.updateCategory(id, dto);
    await this.invalidateProductsCache();
    return category;
  }

  async removeCategory(id: string) {
    await this.assertCategoryExists(id);
    const products = await this.repository.countProductsInCategory(id);
    if (products > 0)
      throw new AppException('PRODUCT_CATEGORY_IN_USE', {
        details: { products },
      });
    await this.repository.deleteCategory(id);
  }

  private async assertCategoryExists(id: string) {
    const category = await this.repository.findCategoryById(id);
    if (!category) throw new AppException('PRODUCT_CATEGORY_NOT_FOUND');
    return category;
  }

  private async assertCategoryNameAvailable(name: string, exceptId?: string) {
    const existing = await this.repository.findCategoryByName(name);
    if (existing && existing.id !== exceptId)
      throw new AppException('PRODUCT_CATEGORY_ALREADY_EXISTS');
  }

  async findAll(query: FindProductsQueryDto): Promise<ProductWithRelations[]> {
    const cached = await this.cache.get<ProductWithRelations[]>(
      CATALOG_CACHE_KEYS.products,
    );
    const products = cached ?? (await this.loadAndCacheAll());

    return products.filter((p) => {
      if (
        query.productCategoryId &&
        p.productCategoryId !== query.productCategoryId
      )
        return false;
      if (
        query.search &&
        !p.name.toLowerCase().includes(query.search.toLowerCase())
      )
        return false;
      if (query.tagId && !p.tagAssignments.some((a) => a.tagId === query.tagId))
        return false;
      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        const inRange = p.variants.some((v) => {
          const price = Number(v.price);
          if (query.minPrice !== undefined && price < query.minPrice)
            return false;
          if (query.maxPrice !== undefined && price > query.maxPrice)
            return false;
          return true;
        });
        if (!inRange) return false;
      }
      return true;
    });
  }

  findAllForAdmin(query: FindAdminProductsQueryDto) {
    return this.repository.findAdminProducts(query);
  }

  async findOneForAdmin(id: string) {
    const product = await this.repository.findAdminProductById(id);
    if (!product) throw new AppException('PRODUCT_NOT_FOUND');
    return product;
  }

  async findOne(id: string) {
    const product = await this.repository.findProductById(id);
    if (!product) throw new AppException('PRODUCT_NOT_FOUND');
    return product;
  }

  async findOnePublic(id: string) {
    const product = await this.findOne(id);
    if (!product.isActive) throw new AppException('PRODUCT_NOT_FOUND');
    return product;
  }

  private async assertProductExists(id: string) {
    const product = await this.repository.findProductBasic(id);
    if (!product) throw new AppException('PRODUCT_NOT_FOUND');
    return product;
  }

  async create(dto: CreateProductDto) {
    await this.assertCategoryExists(dto.productCategoryId);
    if (dto.tagIds?.length) await this.assertTagsExist(dto.tagIds);
    if (dto.variants?.length) {
      const keys = dto.variants.map((v) => variantKey(v.brand, v.presentation));
      if (new Set(keys).size !== keys.length)
        throw new AppException('PRODUCT_VARIANT_ALREADY_EXISTS');
    }
    const product = await this.repository.createProduct(dto);
    await this.invalidateProductsCache();
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.assertProductExists(id);
    if (dto.productCategoryId)
      await this.assertCategoryExists(dto.productCategoryId);
    const product = await this.repository.updateProduct(id, dto);
    await this.invalidateProductsCache(id);
    return product;
  }

  async toggleActive(id: string) {
    const product = await this.assertProductExists(id);
    const updated = await this.repository.toggleActive(id, !product.isActive);
    await this.invalidateProductsCache(id);
    return updated;
  }

  async remove(id: string) {
    const history = await this.repository.countProductHistory(id);
    if (!history) throw new AppException('PRODUCT_NOT_FOUND');
    const { viewLogs, recommendations } = history._count;
    if (viewLogs > 0 || recommendations > 0)
      throw new AppException('PRODUCT_HAS_HISTORY', {
        details: { viewLogs, recommendations },
      });

    const imagePublicIds = await this.repository.deleteProduct(id);
    await this.invalidateProductsCache();
    await Promise.all(
      imagePublicIds.map((publicId) => this.destroyImageQuietly(publicId)),
    );
  }

  async addVariant(productId: string, dto: CreateProductVariantDto) {
    await this.assertProductExists(productId);
    await this.assertVariantAvailable(productId, dto.brand, dto.presentation);
    const variant = await this.repository.createVariant(productId, dto);
    await this.invalidateProductsCache(productId);
    return variant;
  }

  async updateVariant(variantId: string, dto: UpdateProductVariantDto) {
    const existing = await this.assertVariantExists(variantId);

    if (dto.brand !== undefined || dto.presentation !== undefined)
      await this.assertVariantAvailable(
        existing.productId,
        dto.brand ?? existing.brand,
        dto.presentation ?? existing.presentation,
        variantId,
      );

    const replacesImage =
      dto.imageUrl !== undefined && dto.imageUrl !== existing.imageUrl;
    const variant = await this.repository.updateVariant(variantId, {
      ...dto,
      ...(replacesImage ? { imagePublicId: null } : {}),
    });
    await this.invalidateProductsCache(existing.productId);
    if (replacesImage && existing.imagePublicId)
      await this.destroyImageQuietly(existing.imagePublicId);
    return variant;
  }

  async removeVariant(variantId: string) {
    const existing = await this.assertVariantExists(variantId);
    await this.repository.deleteVariant(variantId);
    await this.invalidateProductsCache(existing.productId);
    if (existing.imagePublicId)
      await this.destroyImageQuietly(existing.imagePublicId);
  }

  async uploadVariantImage(variantId: string, fileBuffer: Buffer) {
    const existing = await this.assertVariantExists(variantId);

    const publicId = this.cloudinary.productImagePublicId(variantId);
    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await this.cloudinary.uploadProductImage(fileBuffer, publicId);
    } catch (error) {
      await this.destroyImageQuietly(publicId);
      this.logger.error(
        `Fallo subiendo imagen de la variante ${variantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new AppException('PRODUCT_IMAGE_UPLOAD_FAILED', { cause: error });
    }

    try {
      const variant = await this.repository.setVariantImage(
        variantId,
        uploaded.url,
        uploaded.publicId,
      );
      await this.invalidateProductsCache(existing.productId);
      if (existing.imagePublicId)
        await this.destroyImageQuietly(existing.imagePublicId);
      return variant;
    } catch (error) {
      await this.destroyImageQuietly(uploaded.publicId);
      throw error;
    }
  }

  async removeVariantImage(variantId: string) {
    const existing = await this.assertVariantExists(variantId);
    const variant = await this.repository.setVariantImage(
      variantId,
      null,
      null,
    );
    await this.invalidateProductsCache(existing.productId);
    if (existing.imagePublicId)
      await this.destroyImageQuietly(existing.imagePublicId);
    return variant;
  }

  private async assertVariantExists(variantId: string) {
    const variant = await this.repository.findVariantById(variantId);
    if (!variant) throw new AppException('PRODUCT_VARIANT_NOT_FOUND');
    return variant;
  }

  private async assertVariantAvailable(
    productId: string,
    brand: string,
    presentation: string,
    exceptVariantId?: string,
  ) {
    const existing =
      await this.repository.findVariantByProductBrandPresentation(
        productId,
        brand,
        presentation,
      );
    if (existing && existing.id !== exceptVariantId)
      throw new AppException('PRODUCT_VARIANT_ALREADY_EXISTS', {
        message: `Ya existe la variante "${brand} - ${presentation}".`,
      });
  }

  async getRecommendationsForTreatment(treatmentId: string) {
    const cacheKey = CATALOG_CACHE_KEYS.recommendation(treatmentId);
    const cached = await this.cache.get<unknown[]>(cacheKey);
    if (cached) return cached;

    const recommendations =
      await this.repository.findRecommendationsForTreatment(treatmentId);
    const products = recommendations.map((r) => r.product);

    void this.cache.set(cacheKey, products, CATALOG_CACHE_TTL_SECONDS);
    return products;
  }

  async addRecommendation(treatmentId: string, productId: string) {
    await this.assertProductExists(productId);
    if (!(await this.repository.treatmentExists(treatmentId)))
      throw new AppException('PRODUCT_TREATMENT_NOT_FOUND');

    const existing = await this.repository.findRecommendation(
      treatmentId,
      productId,
    );
    if (existing)
      throw new AppException('PRODUCT_RECOMMENDATION_ALREADY_EXISTS');

    const recommendation = await this.repository.createRecommendation(
      treatmentId,
      productId,
    );
    await this.cache.delete(CATALOG_CACHE_KEYS.recommendation(treatmentId));
    return recommendation;
  }

  async removeRecommendation(id: string) {
    const recommendation = await this.repository.findRecommendationById(id);
    if (!recommendation)
      throw new AppException('PRODUCT_RECOMMENDATION_NOT_FOUND');

    await this.repository.deleteRecommendation(id);
    await this.cache.delete(
      CATALOG_CACHE_KEYS.recommendation(recommendation.treatmentId),
    );
  }

  findAllTags() {
    return this.repository.findAllTags();
  }

  findAllTagsForAdmin() {
    return this.repository.findAllTagsForAdmin();
  }

  async createTag(dto: CreateProductTagDto) {
    await this.assertTagNameAvailable(dto.name);
    return this.repository.createTag(dto);
  }

  async updateTag(id: string, dto: UpdateProductTagDto) {
    await this.assertTagExists(id);
    if (dto.name !== undefined) await this.assertTagNameAvailable(dto.name, id);
    const tag = await this.repository.updateTag(id, dto);
    await this.invalidateProductsCache();
    return tag;
  }

  async removeTag(id: string) {
    await this.assertTagExists(id);
    await this.repository.deleteTag(id);
    await this.invalidateProductsCache();
  }

  async assignTags(productId: string, tagIds: string[]) {
    await this.assertProductExists(productId);
    if (tagIds.length) await this.assertTagsExist(tagIds);
    await this.repository.replaceProductTags(productId, tagIds);
    await this.invalidateProductsCache(productId);
  }

  private async assertTagExists(id: string) {
    const tag = await this.repository.findTagById(id);
    if (!tag) throw new AppException('PRODUCT_TAG_NOT_FOUND');
    return tag;
  }

  private async assertTagNameAvailable(name: string, exceptId?: string) {
    const existing = await this.repository.findTagByName(name);
    if (existing && existing.id !== exceptId)
      throw new AppException('PRODUCT_TAG_ALREADY_EXISTS');
  }

  private async assertTagsExist(tagIds: string[]) {
    const unique = [...new Set(tagIds)];
    const found = await this.repository.countTagsByIds(unique);
    if (found !== unique.length)
      throw new AppException('PRODUCT_TAG_NOT_FOUND');
  }

  async findRelated(productId: string) {
    await this.assertProductExists(productId);
    return this.repository.findRelatedByTags(productId);
  }

  async logView(productId: string, phone: string) {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(phone),
    );
    if (!client)
      throw new AppException('NOT_FOUND', {
        message: 'No existe ningún cliente registrado con este número',
      });
    await this.assertProductExists(productId);
    return this.repository.logView(client.id, productId);
  }

  async findRecommendedForClient(phone: string) {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(phone),
    );
    if (!client)
      throw new AppException('NOT_FOUND', {
        message: 'No existe ningún cliente registrado con este número',
      });

    const mostViewed = await this.repository.findMostViewedProductIds(
      client.id,
    );
    if (mostViewed.length === 0) return [];

    const relatedSets = await Promise.all(
      mostViewed.map((id) => this.repository.findRelatedByTags(id, 3)),
    );
    const seen = new Set(mostViewed);
    return relatedSets
      .flat()
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .slice(0, 8);
  }

  private async loadAndCacheAll() {
    const products = await this.repository.findAllActiveProducts();
    void this.cache.set(
      CATALOG_CACHE_KEYS.products,
      products,
      CATALOG_CACHE_TTL_SECONDS,
    );
    return products;
  }

  private async invalidateProductsCache(productId?: string) {
    await this.cache.delete(CATALOG_CACHE_KEYS.products);
    if (!productId) return;
    const treatmentIds =
      await this.repository.findTreatmentIdsRecommending(productId);
    await Promise.all(
      treatmentIds.map((treatmentId) =>
        this.cache.delete(CATALOG_CACHE_KEYS.recommendation(treatmentId)),
      ),
    );
  }

  private async destroyImageQuietly(publicId: string) {
    try {
      await this.cloudinary.destroyImage(publicId);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar la imagen ${publicId} de Cloudinary: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
