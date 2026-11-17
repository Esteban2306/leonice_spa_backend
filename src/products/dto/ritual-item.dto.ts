import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  RITUAL_MAX_ITEMS,
  RITUAL_MAX_QUANTITY,
  RITUAL_MIN_ITEMS,
} from '../domain/ritual-pricing';

export class RitualItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(RITUAL_MAX_QUANTITY)
  quantity: number = 1;
}

export class ReplaceRitualItemsDto {
  @IsArray()
  @ArrayMinSize(RITUAL_MIN_ITEMS)
  @ArrayMaxSize(RITUAL_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => RitualItemDto)
  items: RitualItemDto[];
}
