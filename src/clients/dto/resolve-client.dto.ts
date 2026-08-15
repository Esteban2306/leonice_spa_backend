import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class ConsentInputDto {
  @IsBoolean()
  healthDataConsent: boolean;

  @IsString()
  policyVersion: string;
}

export class ResolveClientDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsString()
  @IsOptional()
  whatsappJid?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;

  @ValidateIf(
    (o: ResolveClientDto) =>
      o.allergies !== undefined || o.isPregnant !== undefined,
  )
  @ValidateNested()
  @Type(() => ConsentInputDto)
  consent?: ConsentInputDto;
}
