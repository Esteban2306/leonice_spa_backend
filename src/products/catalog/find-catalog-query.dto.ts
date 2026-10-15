import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import type { CatalogSort } from './product-catalog.mapper';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATALOG_SORTS: CatalogSort[] = [
  'featured',
  'price-asc',
  'price-desc',
  'name',
];

export class FindCatalogQueryDto {
  @IsOptional()
  @IsString()
  @Matches(SLUG)
  category?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  )
  @Matches(SLUG, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(CATALOG_SORTS)
  sort?: CatalogSort;
}
