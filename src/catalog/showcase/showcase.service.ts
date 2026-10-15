import { Injectable } from '@nestjs/common';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { PromotionsService } from 'src/promotions/promotions.service';
import { AppException } from 'src/common/errors/app.exception';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from '../constants/catalog-cache.constants';
import {
  ShowcaseCategoryRecord,
  ShowcaseRepository,
} from './showcase.repository';
import {
  hasVisibleTreatments,
  toCategoryDetail,
  toCategorySummary,
  toTreatmentDetail,
} from './showcase.mapper';

@Injectable()
export class ShowcaseService {
  constructor(
    private readonly repository: ShowcaseRepository,
    private readonly cache: SafeCacheService,
    private readonly promotionsService: PromotionsService,
  ) {}

  async listCategories() {
    const [tree, promotions] = await this.load();
    return tree.map((category) => toCategorySummary(category, promotions));
  }

  async getCategory(categorySlug: string) {
    const [tree, promotions] = await this.load();
    return toCategoryDetail(this.findCategory(tree, categorySlug), promotions);
  }

  async getTreatment(categorySlug: string, treatmentSlug: string) {
    const [tree, promotions] = await this.load();
    const category = this.findCategory(tree, categorySlug);
    const treatment = category.treatments.find(
      (candidate) => candidate.slug === treatmentSlug,
    );
    if (!treatment) throw new AppException('SHOWCASE_TREATMENT_NOT_FOUND');
    return toTreatmentDetail(category, treatment, promotions);
  }

  private findCategory(tree: ShowcaseCategoryRecord[], slug: string) {
    const category = tree.find((candidate) => candidate.slug === slug);
    if (!category) throw new AppException('SHOWCASE_CATEGORY_NOT_FOUND');
    return category;
  }

  private async load() {
    return Promise.all([
      this.loadTree(),
      this.promotionsService.findAllCurrentlyValid(),
    ]);
  }

  private async loadTree(): Promise<ShowcaseCategoryRecord[]> {
    const cached = await this.cache.get<ShowcaseCategoryRecord[]>(
      CATALOG_CACHE_KEYS.showcase,
    );
    if (cached) return cached;

    const tree = (await this.repository.findTree()).filter(
      hasVisibleTreatments,
    );
    void this.cache.set(
      CATALOG_CACHE_KEYS.showcase,
      tree,
      CATALOG_CACHE_TTL_SECONDS,
    );
    return tree;
  }
}
