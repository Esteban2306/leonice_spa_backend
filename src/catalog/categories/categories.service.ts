import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from '../constants/catalog-cache.constants';
import { Category } from '@prisma/client';

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

    const category = await this.repository.create(dto);
    await this.invalidateCache();
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);

    const category = await this.repository.update(id, dto);
    await this.invalidateCache();
    return category;
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.delete(CATALOG_CACHE_KEYS.categories);
  }
}
