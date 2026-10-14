import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CollapseWhitespace } from './collapse-whitespace.transform';

export const MAX_VARIANT_PRICE = 99_999_999.99;

export class CreateProductVariantDto {
  @CollapseWhitespace()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand: string;

  @CollapseWhitespace()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  presentation: string;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_VARIANT_PRICE)
  price: number;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl?: string;
}
