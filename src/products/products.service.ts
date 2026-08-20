import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductsRepository } from './products.repository';
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

@Injectable()
export class ProductsService {
  constructor(
    private readonly repository: ProductsRepository,
    private readonly cache: SafeCacheService,
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

  async findAll(productCategoryId?: string) {
    const cached = await this.cache.get<Array<{ productCategoryId: string }>>(
      CATALOG_CACHE_KEYS.products,
    );
    const products = cached ?? (await this.loadAndCacheAll());

    return productCategoryId
      ? products.filter((p) => p.productCategoryId === productCategoryId)
      : products;
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
