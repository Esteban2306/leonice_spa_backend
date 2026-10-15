import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { FindAdminCategoriesQueryDto } from './dto/find-admin-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from '../constants/catalog-cache.constants';
import { Category } from '@prisma/client';
import { uniqueSlug } from '../common/slugify';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    private readonly cache: SafeCacheService,
  ) {}

  async findAll(): Promise<Category[]> {
    const cached = await this.cache.get<Category[]>(
      CATALOG_CACHE_KEYS.categories,
    );
    if (cached) return cached;

    const categories = await this.repository.findAllActive();
    void this.cache.set(
      CATALOG_CACHE_KEYS.categories,
      categories,
      CATALOG_CACHE_TTL_SECONDS,
    );
    return categories;
  }

  async findAllForAdmin(query: FindAdminCategoriesQueryDto) {
    const categories = await this.repository.findForAdmin(query);
    return categories.map(({ treatments, capacityPools, ...category }) => {
      const activePools = capacityPools.filter((pool) => pool.isActive);
      return {
        ...category,
        treatmentCount: treatments.length,
        activeTreatmentCount: treatments.filter((t) => t.isActive).length,
        capacityPoolCount: activePools.length,
        totalCapacity: activePools.reduce(
          (sum, pool) => sum + pool.maxConcurrent,
          0,
        ),
      };
    });
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.repository.findById(id);
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.repository.findByName(dto.name);
    if (existing)
      throw new ConflictException(
        `Ya existe una categoría llamada "${dto.name}"`,
      );

    const slug = await uniqueSlug(dto.name, (candidate) =>
      this.repository.isSlugTaken(candidate),
    );
    const category = await this.repository.create({ ...dto, slug });
    await this.invalidateCache();
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const current = await this.findOne(id);

    if (dto.name !== undefined && dto.name !== current.name) {
      const existing = await this.repository.findByName(dto.name);
      if (existing && existing.id !== id)
        throw new ConflictException(
          `Ya existe una categoría llamada "${dto.name}"`,
        );
    }

    const category = await this.repository.update(id, dto);
    await this.invalidateCache();
    return category;
  }

  private async invalidateCache(): Promise<void> {
    await Promise.all([
      this.cache.delete(CATALOG_CACHE_KEYS.categories),
      this.cache.delete(CATALOG_CACHE_KEYS.showcase),
    ]);
  }
}
