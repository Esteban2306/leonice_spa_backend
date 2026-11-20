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
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReservationChannel } from '@prisma/client';

export const MAX_AGREED_PRICE_COP = 10_000_000;

export class AgreedPriceDto {
  @IsUUID('4')
  treatmentId: string;

  @IsInt()
  @Min(0)
  @Max(MAX_AGREED_PRICE_COP)
  price: number;
}

class ConsentInputDto {
  @IsBoolean()
  healthDataConsent: boolean;

  @IsString()
  @MaxLength(20)
  policyVersion: string;
}

export class ClientInputDto {
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

  /** Precio acordado por servicio. Solo lo puede fijar el panel (sesión de administrador). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AgreedPriceDto)
  agreedPrices?: AgreedPriceDto[];
}
