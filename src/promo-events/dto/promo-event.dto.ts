import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsZonedDateTime } from '../../common/validation/date-input.validators';

export const EVENT_NAME_MAX = 80;
export const EVENT_DESCRIPTION_MAX = 240;
export const EVENT_PRIZES_MAX = 120;

export class CreatePromoEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(EVENT_NAME_MAX)
  name: string;

  @IsString()
  @MinLength(10)
  @MaxLength(EVENT_DESCRIPTION_MAX)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(EVENT_PRIZES_MAX)
  prizes?: string;

  @IsZonedDateTime()
  startsAt: string;

  @IsZonedDateTime()
  endsAt: string;

  @IsOptional()
  @IsBoolean()
  ticketsEnabled?: boolean;
}

export class UpdatePromoEventDto extends PartialType(CreatePromoEventDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DrawPrizeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(EVENT_PRIZES_MAX)
  prize: string;
}
