import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { CatalogSort } from './product-catalog.mapper';

export const MAX_PAGE_SIZE = 48;
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
  @ArrayMaxSize(20)
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

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
