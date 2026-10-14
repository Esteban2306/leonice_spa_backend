import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  CatalogStatusFilter,
  TransformTrimmedQuery,
} from '../../catalog/common/catalog-filters';

export class FindAdminProductsQueryDto {
  @IsOptional()
  @TransformTrimmedQuery()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  productCategoryId?: string;

  @IsOptional()
  @IsEnum(CatalogStatusFilter)
  status: CatalogStatusFilter = CatalogStatusFilter.ALL;
}
