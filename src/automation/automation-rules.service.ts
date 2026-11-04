import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AutomationRulesRepository } from './repositories/automation-rules.repository';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { FOLLOW_UP_TEMPLATES } from '../conduit/templates/conduit-template-catalog';
import { templateNeedsFollowUpPromotion } from './domain/follow-up-message';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

@Injectable()
export class AutomationRulesService {
  constructor(private readonly repository: AutomationRulesRepository) {}

  async create(dto: CreateAutomationRuleDto) {
    if (!dto.treatmentId && !dto.categoryId)
      throw new BadRequestException(
        'La regla necesita un tratamiento o una categoría',
      );
    if (dto.treatmentId && dto.categoryId)
      throw new BadRequestException(
        'La regla debe apuntar a uno de los dos, no a ambos',
      );
    await this.assertConsistent(dto);
    return this.repository.create(dto);
  }

  async update(id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Regla no encontrada');
    await this.assertConsistent({
      reminderDays: dto.reminderDays ?? existing.reminderDays ?? undefined,
      reactivationDays:
        dto.reactivationDays ?? existing.reactivationDays ?? undefined,
      templateCode: dto.templateCode ?? existing.templateCode ?? undefined,
      promotionId: dto.promotionId ?? existing.promotionId ?? undefined,
    });
    return this.repository.update(id, dto);
  }

  async remove(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Regla no encontrada');
    await this.repository.delete(id);
    return { ok: true };
  }

  private async assertConsistent(
    rule: Pick<
      CreateAutomationRuleDto,
      'reminderDays' | 'reactivationDays' | 'templateCode' | 'promotionId'
    >,
  ) {
    if (rule.reminderDays == null && rule.reactivationDays == null) {
      throw new BadRequestException(
        'La regla necesita un recordatorio previo o un seguimiento posterior',
      );
    }
    if (rule.templateCode && rule.reactivationDays == null) {
      throw new BadRequestException(
        'El mensaje elegido necesita los días del seguimiento',
      );
    }
    const template = FOLLOW_UP_TEMPLATES.find(
      (item) => item.code === rule.templateCode,
    );
    const needsPromotion = template
      ? templateNeedsFollowUpPromotion(template)
      : false;
    if (needsPromotion && !rule.promotionId) {
      throw new BadRequestException('Ese mensaje necesita una promoción');
    }
    if (rule.templateCode && !needsPromotion && rule.promotionId) {
      throw new BadRequestException('Ese mensaje no usa promoción');
    }
    if (rule.promotionId) {
      const promotion = await this.repository.findPromotion(rule.promotionId);
      if (!promotion) throw new BadRequestException('La promoción no existe');
    }
  }

  findByTreatment(treatmentId: string) {
    return this.repository.findByTreatment(treatmentId);
  }
  findByCategory(categoryId: string) {
    return this.repository.findByCategory(categoryId);
  }
}
