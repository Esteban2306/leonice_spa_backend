import { IsCalendarDate } from '../../common/validation/date-input.validators';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  @IsCalendarDate()
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
