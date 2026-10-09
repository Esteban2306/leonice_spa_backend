import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  CatalogStatusFilter,
  TransformBooleanQuery,
  TransformTrimmedQuery,
} from '../../common/catalog-filters';

export class FindAdminCategoriesQueryDto {
  @IsOptional()
  @TransformTrimmedQuery()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(CatalogStatusFilter)
  status: CatalogStatusFilter = CatalogStatusFilter.ALL;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isPrincipal?: boolean;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  tracksHairProfile?: boolean;
}
