import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsentType } from '@prisma/client';

class ConduitConsentDto {
  @IsEnum(ConsentType)
  type: ConsentType;

  @IsBoolean()
  accepted: boolean;

  @IsString()
  policyVersion: string;
}

export class ConduitCreateClientDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsOptional()
  @IsString()
  whatsappJid?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

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
