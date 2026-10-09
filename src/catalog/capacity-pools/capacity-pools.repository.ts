import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateCapacityPoolDto } from './dto/create-capacity-pool.dto';
import { FindCapacityPoolsQueryDto } from './dto/find-capacity-pools-query.dto';
import { isActiveWhere } from '../common/catalog-filters';
import { UpdateCapacityPoolDto } from './dto/update-capacity-pool.dto';

@Injectable()
export class CapacityPoolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(query: FindCapacityPoolsQueryDto) {
    return this.prisma.client.capacityPool.findMany({
      where: {
        ...(query.categoryId && { categoryId: query.categoryId }),
        ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
        ...isActiveWhere(query.status),
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
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
