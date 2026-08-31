import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { HairColor, HairLength } from '@prisma/client';

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

  async findHairLengthPricing(treatmentId: string) {
    return this.prisma.client.treatmentHairLengthPricing.findMany({
      where: { treatmentId },
    });
  }

  async findHairColorSurcharges(treatmentId: string) {
    return this.prisma.client.treatmentHairColorSurcharge.findMany({
      where: { treatmentId },
    });
  }

  async replaceHairLengthPricing(
    treatmentId: string,
    entries: {
      hairLength: HairLength;
      price: number;
      durationMinutes: number;
    }[],
  ) {
    return this.prisma.client.$transaction([
      this.prisma.client.treatmentHairLengthPricing.deleteMany({
        where: { treatmentId },
      }),
      this.prisma.client.treatmentHairLengthPricing.createMany({
        data: entries.map((e) => ({ treatmentId, ...e })),
      }),
    ]);
  }

  async replaceHairColorSurcharges(
    treatmentId: string,
    entries: {
      hairColor: HairColor;
      surcharge: number;
      extraDurationMinutes: number;
    }[],
  ) {
    return this.prisma.client.$transaction([
      this.prisma.client.treatmentHairColorSurcharge.deleteMany({
        where: { treatmentId },
      }),
      this.prisma.client.treatmentHairColorSurcharge.createMany({
        data: entries.map((e) => ({ treatmentId, ...e })),
      }),
    ]);
  }
}
