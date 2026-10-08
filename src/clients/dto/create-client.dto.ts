import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validation/date-input.validators';

export class CreateClientDto {
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  phone!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsCalendarDate()
  birthDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  healthDataPolicyVersion?: string;
}
