import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  CatalogStatusFilter,
  TransformTrimmedQuery,
} from '../../common/catalog-filters';

export class FindCapacityPoolsQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @TransformTrimmedQuery()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(CatalogStatusFilter)
  status: CatalogStatusFilter = CatalogStatusFilter.ACTIVE;
}
