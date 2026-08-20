import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.client.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.client.category.findUnique({ where: { id } });
  }

  findByName(name: string) {
    return this.prisma.client.category.findUnique({ where: { name } });
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.client.category.create({ data: dto });
  }

  update(id: string, dto: UpdateCategoryDto) {
    return this.prisma.client.category.update({ where: { id }, data: dto });
  }
}
