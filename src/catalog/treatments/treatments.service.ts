import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TreatmentsRepository } from './treatments.repository';
import { CategoriesService } from '../categories/categories.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from '../constants/catalog-cache.constants';
import { Decimal } from '@prisma/client/runtime/library';

interface RangeCheck {
  basePriceMin?: number | Decimal | null;
  basePriceMax?: number | Decimal | null;
  baseDurationMinMinutes?: number | Decimal | null;
  baseDurationMaxMinutes?: number | Decimal | null;
}

@Injectable()
export class TreatmentsService {
  constructor(
    private readonly repository: TreatmentsRepository,
    private readonly categoriesService: CategoriesService,
    private readonly cache: SafeCacheService,
  ) {}

  async findAll(categoryId?: string) {
    const cached = await this.cache.get<Array<{ categoryId: string }>>(
      CATALOG_CACHE_KEYS.treatments,
    );
    const treatments = cached ?? (await this.loadAndCacheAll());

    return categoryId
      ? treatments.filter((t) => t.categoryId === categoryId)
      : treatments;
  }

  async findOne(id: string) {
    const treatment = await this.repository.findById(id);
    if (!treatment) throw new NotFoundException('Tratamiento no encontrado');
    return treatment;
  }

  async create(dto: CreateTreatmentDto) {
    await this.categoriesService.findOne(dto.categoryId);
    this.assertConsistentRanges(dto);

    const existing = await this.repository.findByCategoryAndName(
      dto.categoryId,
      dto.name,
    );
    if (existing)
      throw new ConflictException(`Ya existe "${dto.name}" en esta categoría`);

    const treatment = await this.repository.create(dto);
    await this.invalidateCache();
    return treatment;
  }

  async update(id: string, dto: UpdateTreatmentDto) {
    const current = await this.findOne(id);
    this.assertConsistentRanges({ ...current, ...dto });

    const treatment = await this.repository.update(id, dto);
    await this.invalidateCache();
    return treatment;
  }

  private assertConsistentRanges(data: RangeCheck) {
    if (
      data.basePriceMin != null &&
      data.basePriceMax != null &&
      data.basePriceMin > data.basePriceMax
    ) {
      throw new BadRequestException(
        'El precio mínimo no puede ser mayor que el máximo',
      );
    }
    if (
      data.baseDurationMinMinutes != null &&
      data.baseDurationMaxMinutes != null &&
      data.baseDurationMinMinutes > data.baseDurationMaxMinutes
    ) {
      throw new BadRequestException(
        'La duración mínima no puede ser mayor que la máxima',
      );
    }
  }

  private async loadAndCacheAll() {
    const treatments = await this.repository.findAllActive();
    void this.cache.set(
      CATALOG_CACHE_KEYS.treatments,
      treatments,
      CATALOG_CACHE_TTL_SECONDS,
    );
    return treatments;
  }

  private async invalidateCache() {
    await this.cache.delete(CATALOG_CACHE_KEYS.treatments);
  }
}
