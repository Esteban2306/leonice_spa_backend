import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTreatmentDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsBoolean()
  requiresPriorAssessment?: boolean;

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
