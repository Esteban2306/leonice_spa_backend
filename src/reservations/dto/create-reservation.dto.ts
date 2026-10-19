import {
  IsCalendarDate,
  IsZonedDateTime,
} from '../../common/validation/date-input.validators';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReservationChannel } from '@prisma/client';

class ConsentInputDto {
  @IsBoolean()
  healthDataConsent: boolean;

  @IsString()
  @MaxLength(20)
  policyVersion: string;
}

class ClientInputDto {
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
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsentInputDto)
  consent?: ConsentInputDto;
}

export class CreateReservationDto {
  @ValidateNested()
  @Type(() => ClientInputDto)
  client: ClientInputDto;

  @ArrayMaxSize(10)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  treatments: string[];

  @IsZonedDateTime()
  scheduledStart: string;

  @IsOptional()
  @IsEnum(ReservationChannel)
  channel?: ReservationChannel;
}
