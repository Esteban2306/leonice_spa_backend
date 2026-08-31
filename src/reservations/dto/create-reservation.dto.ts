import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HairColor, HairLength, ReservationChannel } from '@prisma/client';

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
  @IsDateString()
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

  @IsOptional()
  @IsEnum(HairLength)
  hairLength?: HairLength;

  @IsOptional()
  @IsEnum(HairColor)
  hairColor?: HairColor;
}

export class CreateReservationDto {
  @ValidateNested()
  @Type(() => ClientInputDto)
  client: ClientInputDto;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  treatments: string[];

  @IsDateString()
  scheduledStart: string;

  @IsOptional()
  @IsEnum(ReservationChannel)
  channel?: ReservationChannel;
}
