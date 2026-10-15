import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FindAdminCategoriesQueryDto } from './dto/find-admin-categories-query.dto';
import { isActiveWhere } from '../common/catalog-filters';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.client.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findForAdmin(query: FindAdminCategoriesQueryDto) {
    return this.prisma.client.category.findMany({
      where: {
        ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
        ...isActiveWhere(query.status),
        ...(query.isPrincipal !== undefined && {
          isPrincipal: query.isPrincipal,
        }),
        ...(query.tracksHairProfile !== undefined && {
          tracksHairProfile: query.tracksHairProfile,
        }),
      },
      orderBy: [{ isPrincipal: 'desc' }, { name: 'asc' }],
      include: {
        treatments: { select: { isActive: true } },
        capacityPools: { select: { isActive: true, maxConcurrent: true } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.client.category.findUnique({ where: { id } });
  }

  findByName(name: string) {
    return this.prisma.client.category.findUnique({ where: { name } });
  }

  async isSlugTaken(slug: string) {
    const found = await this.prisma.client.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  create(dto: CreateCategoryDto & { slug: string }) {
    return this.prisma.client.category.create({ data: dto });
  }

  update(id: string, dto: UpdateCategoryDto) {
    return this.prisma.client.category.update({ where: { id }, data: dto });
  }
}
