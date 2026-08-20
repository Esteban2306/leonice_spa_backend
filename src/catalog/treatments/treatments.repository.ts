import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';

@Injectable()
export class TreatmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.client.treatment.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.client.treatment.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  findByCategoryAndName(categoryId: string, name: string) {
    return this.prisma.client.treatment.findUnique({
      where: { categoryId_name: { categoryId, name } },
    });
  }

  create(dto: CreateTreatmentDto) {
    return this.prisma.client.treatment.create({ data: dto });
  }

  update(id: string, dto: UpdateTreatmentDto) {
    return this.prisma.client.treatment.update({ where: { id }, data: dto });
  }
}
