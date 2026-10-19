import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  CatalogStatusFilter,
  TransformTrimmedQuery,
} from '../../catalog/common/catalog-filters';

export class FindAdminProductsQueryDto {
  @IsOptional()
  @TransformTrimmedQuery()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  productCategoryId?: string;

  @IsOptional()
  @IsEnum(CatalogStatusFilter)
  status: CatalogStatusFilter = CatalogStatusFilter.ALL;
}
