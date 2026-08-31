import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { HairLength } from '@prisma/client';

class HairLengthPriceEntryDto {
  @IsEnum(HairLength)
  hairLength: HairLength;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(1)
  durationMinutes: number;
}

export class SetHairLengthPricingDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => HairLengthPriceEntryDto)
  entries: HairLengthPriceEntryDto[];
}
