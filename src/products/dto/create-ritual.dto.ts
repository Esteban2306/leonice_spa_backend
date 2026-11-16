import { IntersectionType, OmitType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, IsUrl, Max, Min } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { MAX_VARIANT_PRICE } from './create-product-variant.dto';
import { ReplaceRitualItemsDto } from './ritual-item.dto';

export class CreateRitualDto extends IntersectionType(
  OmitType(CreateProductDto, ['productCategoryId', 'variants'] as const),
  ReplaceRitualItemsDto,
) {
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(MAX_VARIANT_PRICE)
  price: number;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl?: string;
}
