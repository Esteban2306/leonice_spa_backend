import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AutomationRulesRepository } from './repositories/automation-rules.repository';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
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
    return this.repository.create(dto);
  }

  async update(id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Regla no encontrada');
    return this.repository.update(id, dto);
  }

  findByTreatment(treatmentId: string) {
    return this.repository.findByTreatment(treatmentId);
  }
  findByCategory(categoryId: string) {
    return this.repository.findByCategory(categoryId);
  }
}
