import { DepositCoverage } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
} from 'class-validator';

export const APPROVE_SCOPES = ['GROUP', 'SINGLE'] as const;
export type ApproveScope = (typeof APPROVE_SCOPES)[number];

export class ApproveDepositDto {
  @IsEnum(DepositCoverage)
  coverage!: DepositCoverage;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000)
  amount?: number;

  @IsOptional()
  @IsIn(APPROVE_SCOPES)
  scope?: ApproveScope;
}
