import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { HairColor } from '@prisma/client';

class HairColorSurchargeEntryDto {
  @IsEnum(HairColor)
  hairColor: HairColor;

  @IsNumber()
  @Min(0)
  surcharge: number;

  @IsNumber()
  @Min(0)
  extraDurationMinutes: number;
}

export class SetHairColorSurchargesDto {
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => HairColorSurchargeEntryDto)
  entries: HairColorSurchargeEntryDto[];
}
