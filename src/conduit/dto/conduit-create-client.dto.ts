import { IsCalendarDate } from '../../common/validation/date-input.validators';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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
  @MaxLength(20)
  policyVersion: string;
}

export class ConduitCreateClientDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  whatsappJid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsCalendarDate()
  birthDate?: string;

  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @ArrayMaxSize(4)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConduitConsentDto)
  consents?: ConduitConsentDto[];
}
