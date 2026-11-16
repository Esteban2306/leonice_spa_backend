import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CollapseWhitespace } from './collapse-whitespace.transform';
import { CreateProductVariantDto } from './create-product-variant.dto';
import { ContentList, NullableTrimmed } from './product-content.decorators';

export class CreateProductDto {
  @IsUUID()
  productCategoryId: string;

  @CollapseWhitespace()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string | null;

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  purpose?: string | null;

  @ContentList()
  benefits?: string[];

  @ContentList()
  howToUse?: string[];

  @ContentList()
  idealFor?: string[];

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  usageFrequency?: string | null;

  @ContentList()
  precautions?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];
}
