import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromotionsRepository } from './promotions.repository';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { FindPromotionsQueryDto } from './dto/find-promotions-query.dto';
import {
  PromotionTarget,
  PromotionTargetIds,
  promotionTargetsOf,
  targetColumns,
  touchesTarget,
} from './domain/promotion-target';

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

  async findAllCurrentlyValid() {
    return this.repository.findMany({ currentlyValid: true });
  }

  async create(dto: CreatePromotionDto) {
    const target = this.exactlyOneTarget(dto);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertValidDateRange(startsAt, endsAt);
    await this.assertTargetExists(target);
    await this.assertNoOverlap({ target, startsAt, endsAt });

    return this.repository.create({
      name: dto.name,
      discountPercentage: dto.discountPercentage,
      startsAt,
      endsAt,
      ...targetColumns(target),
    });
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const current = await this.findOne(id);
    const changesTarget = touchesTarget(dto);
    const target = changesTarget
      ? this.exactlyOneTarget(dto)
      : this.exactlyOneTarget(current);
    if (changesTarget) await this.assertTargetExists(target);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    this.assertValidDateRange(startsAt, endsAt);

    if (dto.isActive ?? current.isActive) {
      await this.assertNoOverlap({ target, startsAt, endsAt, excludeId: id });
    }

    return this.repository.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.discountPercentage !== undefined && {
        discountPercentage: dto.discountPercentage,
      }),
      ...(dto.startsAt !== undefined && { startsAt }),
      ...(dto.endsAt !== undefined && { endsAt }),
      ...(changesTarget && targetColumns(target)),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.repository.update(id, { isActive: false });
  }

  async remove(id: string) {
    await this.findOne(id);
    const { automationRules, openCampaigns } =
      await this.repository.countBlockingReferences(id);
    if (automationRules > 0 || openCampaigns > 0) {
      const causes = [
        automationRules > 0
          ? `${automationRules} ${automationRules === 1 ? 'regla de automatización' : 'reglas de automatización'}`
          : null,
        openCampaigns > 0
          ? `${openCampaigns} ${openCampaigns === 1 ? 'campaña en curso o pausada' : 'campañas en curso o pausadas'}`
          : null,
      ].filter(Boolean);
      throw new ConflictException(
        `No se puede eliminar: la usan ${causes.join(' y ')}. Quita esa relación primero o desactiva la promoción.`,
      );
    }
    await this.repository.delete(id);
  }

  private exactlyOneTarget(ids: PromotionTargetIds): PromotionTarget {
    const targets = promotionTargetsOf(ids);
    if (targets.length === 0)
      throw new BadRequestException(
        'La promoción necesita a qué aplica: un servicio, una categoría de servicios, un producto o kit, o una categoría de productos',
      );
    if (targets.length > 1)
      throw new BadRequestException(
        'La promoción debe aplicar a una sola cosa',
      );
    return targets[0];
  }

  private async assertTargetExists(target: PromotionTarget) {
    if (!(await this.repository.targetExists(target)))
      throw new BadRequestException(
        'Lo que elegiste para la promoción ya no existe',
      );
  }

  private async assertNoOverlap(params: {
    target: PromotionTarget;
    startsAt: Date;
    endsAt: Date;
    excludeId?: string;
  }) {
    const overlapping = await this.repository.findOverlapping(params);
    if (overlapping) {
      throw new ConflictException(
        `Ya hay una promoción activa en esas fechas para lo mismo: "${overlapping.name}"`,
      );
    }
  }

  private assertValidDateRange(startsAt: Date, endsAt: Date) {
    if (startsAt >= endsAt)
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de fin',
      );
  }
}
