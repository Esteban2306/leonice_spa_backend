import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

@Controller({ path: 'automation-rules', version: '1' })
export class AutomationRulesController {
  constructor(private readonly service: AutomationRulesService) {}

  @Get()
  findMany(
    @Query('treatmentId') treatmentId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    if (treatmentId) return this.service.findByTreatment(treatmentId);
    if (categoryId) return this.service.findByCategory(categoryId);
    return [];
  }

  @Post()
  create(@Body() dto: CreateAutomationRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.service.update(id, dto);
  }
}
