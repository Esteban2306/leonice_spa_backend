import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ContentList,
  NullableTrimmed,
} from '../../../products/dto/product-content.decorators';

export class CreateTreatmentDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MaxLength(100)
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsBoolean()
  requiresPriorAssessment?: boolean;

  @IsOptional()
  @IsBoolean()
  hasHairVariablePricing?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePriceMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePriceMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseDurationMinMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseDurationMaxMinutes?: number;

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string | null;

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  summary?: string | null;

  @ContentList()
  idealFor?: string[];

  @ContentList()
  benefits?: string[];

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  results?: string | null;

  @ContentList()
  aftercare?: string[];

  @ContentList()
  considerations?: string[];

  @NullableTrimmed()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  recommendedFrequency?: string | null;
}
