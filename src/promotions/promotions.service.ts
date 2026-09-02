import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromotionsRepository } from './promotions.repository';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { FindPromotionsQueryDto } from './dto/find-promotions-query.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly repository: PromotionsRepository) {}

  findMany(query: FindPromotionsQueryDto) {
    return this.repository.findMany(query);
  }

  async findOne(id: string) {
    const promotion = await this.repository.findById(id);
    if (!promotion) throw new NotFoundException('Promoción no encontrada');
    return promotion;
  }

  async create(dto: CreatePromotionDto) {
    this.assertExactlyOneTarget(dto.treatmentId, dto.categoryId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertValidDateRange(startsAt, endsAt);

    return this.repository.create({
      name: dto.name,
      discountPercentage: dto.discountPercentage,
      startsAt,
      endsAt,
      treatmentId: dto.treatmentId,
      categoryId: dto.categoryId,
    });
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const current = await this.findOne(id);

    if (dto.treatmentId !== undefined || dto.categoryId !== undefined) {
      const treatmentId =
        dto.treatmentId !== undefined
          ? dto.treatmentId
          : (current.treatmentId ?? undefined);
      const categoryId =
        dto.categoryId !== undefined
          ? dto.categoryId
          : (current.categoryId ?? undefined);
      this.assertExactlyOneTarget(treatmentId, categoryId);
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    this.assertValidDateRange(startsAt, endsAt);

    return this.repository.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.discountPercentage !== undefined && {
        discountPercentage: dto.discountPercentage,
      }),
      ...(dto.startsAt !== undefined && { startsAt }),
      ...(dto.endsAt !== undefined && { endsAt }),
      ...(dto.treatmentId !== undefined && {
        treatment: dto.treatmentId
          ? { connect: { id: dto.treatmentId } }
          : { disconnect: true },
      }),
      ...(dto.categoryId !== undefined && {
        category: dto.categoryId
          ? { connect: { id: dto.categoryId } }
          : { disconnect: true },
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.repository.update(id, { isActive: false });
  }

  private assertExactlyOneTarget(treatmentId?: string, categoryId?: string) {
    if (!treatmentId && !categoryId)
      throw new BadRequestException(
        'La promoción necesita un tratamiento o una categoría',
      );
    if (treatmentId && categoryId)
      throw new BadRequestException(
        'La promoción debe apuntar a uno de los dos, no a ambos',
      );
  }

  private assertValidDateRange(startsAt: Date, endsAt: Date) {
    if (startsAt >= endsAt)
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de fin',
      );
  }
}
