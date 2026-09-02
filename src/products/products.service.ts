import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProductsRepository,
  ProductWithRelations,
} from './products.repository';
import { SafeCacheService } from '../infrastructure/redis/safe-cache.service';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from 'src/catalog/constants/catalog-cache.constants';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { ClientsRepository } from 'src/clients/repositories/clients.repository';
import { CreateProductTagDto } from './dto/create-product-tag.dto';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';

@Injectable()
export class ProductsService {
  constructor(
    private readonly repository: ProductsRepository,
    private readonly cache: SafeCacheService,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  // ---- Categorías de producto ----

  findAllCategories() {
    return this.repository.findAllCategories();
  }

  async createCategory(dto: CreateProductCategoryDto) {
    const existing = await this.repository.findCategoryByName(dto.name);
    if (existing)
      throw new ConflictException(
        `Ya existe la categoría de producto "${dto.name}"`,
      );
    return this.repository.createCategory(dto);
  }

  async updateCategory(id: string, dto: UpdateProductCategoryDto) {
    await this.assertCategoryExists(id);
    return this.repository.updateCategory(id, dto);
  }

  private async assertCategoryExists(id: string) {
    const category = await this.repository.findCategoryById(id);
    if (!category)
      throw new NotFoundException('Categoría de producto no encontrada');
    return category;
  }

  // ---- Productos ----

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

  async findOne(id: string) {
    const product = await this.repository.findProductById(id);
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async create(dto: CreateProductDto) {
    await this.assertCategoryExists(dto.productCategoryId);
    const product = await this.repository.createProduct(dto);
    await this.invalidateProductsCache();
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    const product = await this.repository.updateProduct(id, dto);
    await this.invalidateProductsCache();
    return product;
  }

  // ---- Variantes ----

  async addVariant(productId: string, dto: CreateProductVariantDto) {
    await this.findOne(productId);

    const existing =
      await this.repository.findVariantByProductBrandPresentation(
        productId,
        dto.brand,
        dto.presentation,
      );
    if (existing)
      throw new ConflictException(
        `Ya existe la variante "${dto.brand} - ${dto.presentation}"`,
      );

    const variant = await this.repository.createVariant(productId, dto);
    await this.invalidateProductsCache();
    return variant;
  }

  async updateVariant(variantId: string, dto: UpdateProductVariantDto) {
    const existing = await this.repository.findVariantById(variantId);
    if (!existing) throw new NotFoundException('Variante no encontrada');

    const variant = await this.repository.updateVariant(variantId, dto);
    await this.invalidateProductsCache();
    return variant;
  }

  // ---- Recomendaciones — el usecase que consumirá Conduit ----

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
    await this.findOne(productId);

    const existing = await this.repository.findRecommendation(
      treatmentId,
      productId,
    );
    if (existing) throw new ConflictException('Esta recomendación ya existe');

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
      throw new NotFoundException('Recomendación no encontrada');

    await this.repository.deleteRecommendation(id);
    await this.cache.delete(
      CATALOG_CACHE_KEYS.recommendation(recommendation.treatmentId),
    );
  }

  async toggleActive(id: string) {
    const product = await this.findOne(id);
    const updated = await this.repository.toggleActive(id, !product.isActive);
    await this.invalidateProductsCache();
    return updated;
  }

  findAllTags() {
    return this.repository.findAllTags();
  }

  async createTag(dto: CreateProductTagDto) {
    const existing = await this.repository.findTagByName(dto.name);
    if (existing)
      throw new ConflictException(`Ya existe la etiqueta "${dto.name}"`);
    return this.repository.createTag(dto);
  }

  async assignTags(productId: string, tagIds: string[]) {
    await this.findOne(productId);
    await this.repository.replaceProductTags(productId, tagIds);
    await this.invalidateProductsCache();
  }

  async findRelated(productId: string) {
    await this.findOne(productId);
    return this.repository.findRelatedByTags(productId);
  }

  async logView(productId: string, phone: string) {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(phone),
    );
    if (!client)
      throw new NotFoundException(
        'No existe ningún cliente registrado con este número',
      );
    await this.findOne(productId);
    return this.repository.logView(client.id, productId);
  }

  async findRecommendedForClient(phone: string) {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(phone),
    );
    if (!client)
      throw new NotFoundException(
        'No existe ningún cliente registrado con este número',
      );

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

  private async invalidateProductsCache() {
    await this.cache.delete(CATALOG_CACHE_KEYS.products);
  }
}
