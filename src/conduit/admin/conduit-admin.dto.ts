import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const PROMPT_TYPES = [
  'CONVERSATION',
  'IMAGE_ANALYSIS',
  'SUMMARY',
  'SALES',
  'APPOINTMENT',
  'SUPPORT',
] as const;

export class ConduitPromptTypeParam {
  @IsIn(PROMPT_TYPES)
  type!: (typeof PROMPT_TYPES)[number];
}

export class FindOutboxQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'SENT', 'FAILED'])
  status?: 'PENDING' | 'SENT' | 'FAILED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
