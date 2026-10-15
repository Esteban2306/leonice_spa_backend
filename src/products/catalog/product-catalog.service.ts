import { Injectable } from '@nestjs/common';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { AppException } from 'src/common/errors/app.exception';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from 'src/catalog/constants/catalog-cache.constants';
import {
  CatalogProductRecord,
  ProductCatalogRepository,
} from './product-catalog.repository';
import {
  CatalogFilters,
  queryCatalog,
  toProductDetail,
} from './product-catalog.mapper';

@Injectable()
export class ProductCatalogService {
  constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly cache: SafeCacheService,
  ) {}

  async list(filters: CatalogFilters) {
    return queryCatalog(await this.load(), filters);
  }

  async detail(slug: string) {
    const catalog = await this.load();
    const product = catalog.find((candidate) => candidate.slug === slug);
    if (!product) throw new AppException('PRODUCT_NOT_FOUND');
    return toProductDetail(product, catalog);
  }

  private async load(): Promise<CatalogProductRecord[]> {
    const cached = await this.cache.get<CatalogProductRecord[]>(
      CATALOG_CACHE_KEYS.productCatalog,
    );
    if (cached) return cached;
    const catalog = await this.repository.findCatalog();
    void this.cache.set(
      CATALOG_CACHE_KEYS.productCatalog,
      catalog,
      CATALOG_CACHE_TTL_SECONDS,
    );
    return catalog;
  }
}
