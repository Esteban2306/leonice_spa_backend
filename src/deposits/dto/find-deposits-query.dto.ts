import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DepositStatus, DepositVerificationMethod } from '@prisma/client';

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
}
