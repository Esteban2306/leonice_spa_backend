import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CapacityPoolsRepository } from './capacity-pools.repository';
import { CategoriesService } from '../categories/categories.service';
import { CreateCapacityPoolDto } from './dto/create-capacity-pool.dto';
import { FindCapacityPoolsQueryDto } from './dto/find-capacity-pools-query.dto';
import { UpdateCapacityPoolDto } from './dto/update-capacity-pool.dto';

@Injectable()
export class CapacityPoolsService {
  constructor(
    private readonly repository: CapacityPoolsRepository,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findMany(query: FindCapacityPoolsQueryDto) {
    if (query.categoryId)
      await this.categoriesService.findOne(query.categoryId);
    return this.repository.findMany(query);
  }

  async findOne(id: string) {
    const pool = await this.repository.findById(id);
    if (!pool) throw new NotFoundException('Capacity pool no encontrado');
    return pool;
  }

  async create(dto: CreateCapacityPoolDto) {
    await this.categoriesService.findOne(dto.categoryId);

    const existing = await this.repository.findByCategoryAndName(
      dto.categoryId,
      dto.name,
    );
    if (existing)
      throw new ConflictException(
        `Ya existe un pool llamado "${dto.name}" en esta categoría`,
      );

    return this.repository.create(dto);
  }

  async update(id: string, dto: UpdateCapacityPoolDto) {
    const current = await this.findOne(id);

    const nextCategoryId = dto.categoryId ?? current.categoryId;
    const nextName = dto.name ?? current.name;
    if (nextCategoryId !== current.categoryId || nextName !== current.name) {
      if (nextCategoryId !== current.categoryId) {
        await this.categoriesService.findOne(nextCategoryId);
      }
      const existing = await this.repository.findByCategoryAndName(
        nextCategoryId,
        nextName,
      );
      if (existing && existing.id !== id)
        throw new ConflictException(
          `Ya existe un pool llamado "${nextName}" en esta categoría`,
        );
    }

    return this.repository.update(id, dto);
  }
}
