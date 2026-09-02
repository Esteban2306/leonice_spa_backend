import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateAutomationRuleDto {
  @IsOptional() @IsUUID() treatmentId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsInt() @Min(0) reminderDays?: number;
  @IsInt() @Min(1) reactivationDays: number;
}
