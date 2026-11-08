import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

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

export class ConduitIntentKeyParam {
  @Matches(/^[a-z][a-z0-9_.-]{1,62}$/)
  key!: string;
}

export class SetSystemPauseDto {
  @IsBoolean()
  paused!: boolean;
}
