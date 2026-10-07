import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DepositStatus, DepositVerificationMethod } from '@prisma/client';
import { Transform } from 'class-transformer';

export class FindDepositsQueryDto {
  @IsOptional()
  @IsEnum(DepositStatus)
  status?: DepositStatus;

  @IsOptional()
  @IsEnum(DepositVerificationMethod)
  method?: DepositVerificationMethod;

  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
