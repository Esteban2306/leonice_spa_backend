import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DepositCoverage } from '@prisma/client';
export class SubmitAutomaticDepositDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone: string;

  @IsEnum(DepositCoverage)
  coverage: DepositCoverage;

  @IsString()
  @MaxLength(12000000)
  imageBase64: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;
}
