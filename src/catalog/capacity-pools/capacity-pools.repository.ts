import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateCapacityPoolDto } from './dto/create-capacity-pool.dto';
import { UpdateCapacityPoolDto } from './dto/update-capacity-pool.dto';

@Injectable()
export class CapacityPoolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCategory(categoryId: string) {
    return this.prisma.client.capacityPool.findMany({
      where: { categoryId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.client.capacityPool.findUnique({ where: { id } });
  }

  findByCategoryAndName(categoryId: string, name: string) {
    return this.prisma.client.capacityPool.findUnique({
      where: { categoryId_name: { categoryId, name } },
    });
  }

  create(dto: CreateCapacityPoolDto) {
    return this.prisma.client.capacityPool.create({ data: dto });
  }

  update(id: string, dto: UpdateCapacityPoolDto) {
    return this.prisma.client.capacityPool.update({ where: { id }, data: dto });
  }
}
