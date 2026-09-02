import { IsEnum } from 'class-validator';
import { DepositCoverage } from '@prisma/client';
export class ApproveDepositDto {
  @IsEnum(DepositCoverage)
  coverage: DepositCoverage;
}
