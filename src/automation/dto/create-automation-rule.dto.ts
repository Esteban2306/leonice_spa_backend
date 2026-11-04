import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { FOLLOW_UP_TEMPLATES } from '../../conduit/templates/conduit-template-catalog';

export const FOLLOW_UP_TEMPLATE_CODES = FOLLOW_UP_TEMPLATES.map(
  (template) => template.code,
);

export class CreateAutomationRuleDto {
  @IsOptional() @IsUUID() treatmentId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsInt() @Min(0) reminderDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(730) reactivationDays?: number;
  @IsOptional() @IsIn(FOLLOW_UP_TEMPLATE_CODES) templateCode?: string;
  @IsOptional() @IsUUID() promotionId?: string;
}
