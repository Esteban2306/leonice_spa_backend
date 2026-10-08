import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class ConduitConsentDto {
  @IsEnum(ConsentType)
  type: ConsentType;

  @IsBoolean()
  accepted: boolean;

  @IsString()
  policyVersion: string;
}

export class ConduitUpdateClientDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConduitConsentDto)
  consents?: ConduitConsentDto[];
}
