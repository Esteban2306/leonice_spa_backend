import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsentType, HairColor, HairLength } from '@prisma/client';
import { Type } from 'class-transformer';

class ConduitConsentDto {
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
  @IsEnum(HairLength)
  hairLength?: HairLength;

  @IsOptional()
  @IsEnum(HairColor)
  hairColor?: HairColor;

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
