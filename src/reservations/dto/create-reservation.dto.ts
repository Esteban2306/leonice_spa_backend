import {
  IsCalendarDate,
  IsZonedDateTime,
} from '../../common/validation/date-input.validators';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReservationChannel } from '@prisma/client';

class ConsentInputDto {
  @IsBoolean()
  healthDataConsent: boolean;

  @IsString()
  policyVersion: string;
}

class ClientInputDto {
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
  @IsCalendarDate()
  birthDate?: string;

  @IsOptional()
  @IsString()
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
