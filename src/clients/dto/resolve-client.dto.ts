import { IsCalendarDate } from '../../common/validation/date-input.validators';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class ConsentInputDto {
  @IsBoolean()
  healthDataConsent: boolean;

  @IsString()
  @MaxLength(20)
  policyVersion: string;
}

export class ResolveClientDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  whatsappJid?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsCalendarDate()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
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
