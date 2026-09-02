import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { DepositCoverage } from '@prisma/client';
export class SubmitAutomaticDepositDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsEnum(DepositCoverage)
  coverage: DepositCoverage;

  @IsString()
  imageBase64: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;
}
