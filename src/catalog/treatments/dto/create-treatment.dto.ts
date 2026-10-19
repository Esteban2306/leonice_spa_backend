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
}
