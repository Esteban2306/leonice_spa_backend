import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  CatalogStatusFilter,
  SortOrder,
  TransformBooleanQuery,
  TransformNumberQuery,
  TransformTrimmedQuery,
} from '../../common/catalog-filters';

export enum TreatmentSortField {
  NAME = 'name',
  PRICE = 'price',
  DURATION = 'duration',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export class FindAdminTreatmentsQueryDto {
  @IsOptional()
  @TransformTrimmedQuery()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(CatalogStatusFilter)
  status: CatalogStatusFilter = CatalogStatusFilter.ALL;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  requiresPriorAssessment?: boolean;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  hasHairVariablePricing?: boolean;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  hasActivePromotion?: boolean;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  hasPrice?: boolean;

  @IsOptional()
  @TransformNumberQuery()
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @TransformNumberQuery()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @TransformNumberQuery()
  @IsInt()
  @Min(0)
  durationMin?: number;

  @IsOptional()
  @TransformNumberQuery()
  @IsInt()
  @Min(0)
  durationMax?: number;

  @IsOptional()
  @IsEnum(TreatmentSortField)
  sortBy: TreatmentSortField = TreatmentSortField.NAME;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.ASC;
}
