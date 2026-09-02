import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateAutomationRuleDto } from '../dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from '../dto/update-automation-rule.dto';

@Injectable()
export class AutomationRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTreatment(treatmentId: string) {
    return this.prisma.client.automationRule.findMany({
      where: { treatmentId },
      orderBy: { reactivationDays: 'asc' },
    });
  }
  findByCategory(categoryId: string) {
    return this.prisma.client.automationRule.findMany({
      where: { categoryId, treatmentId: null },
      orderBy: { reactivationDays: 'asc' },
    });
  }
  findById(id: string) {
    return this.prisma.client.automationRule.findUnique({ where: { id } });
  }
  create(dto: CreateAutomationRuleDto) {
    return this.prisma.client.automationRule.create({ data: dto });
  }
  update(id: string, dto: UpdateAutomationRuleDto) {
    return this.prisma.client.automationRule.update({
      where: { id },
      data: dto,
    });
  }
}
