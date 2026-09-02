import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAutomationRuleDto } from './create-automation-rule.dto';

export class UpdateAutomationRuleDto extends PartialType(
  CreateAutomationRuleDto,
) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
