import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CapacityPoolsRepository } from './capacity-pools.repository';
import { CategoriesService } from '../categories/categories.service';
import { CreateCapacityPoolDto } from './dto/create-capacity-pool.dto';
import { UpdateCapacityPoolDto } from './dto/update-capacity-pool.dto';

@Injectable()
export class CapacityPoolsService {
  constructor(
    private readonly repository: CapacityPoolsRepository,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findByCategory(categoryId: string) {
    await this.categoriesService.findOne(categoryId);
    return this.repository.findByCategory(categoryId);
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
    await this.findOne(id);
    return this.repository.update(id, dto);
  }
}
