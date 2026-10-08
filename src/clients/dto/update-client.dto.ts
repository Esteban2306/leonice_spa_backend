import { IsCalendarDate } from '../../common/validation/date-input.validators';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
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
}
