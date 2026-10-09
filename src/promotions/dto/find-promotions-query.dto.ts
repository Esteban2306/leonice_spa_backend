import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum PromotionValidity {
  CURRENT = 'CURRENT',
  UPCOMING = 'UPCOMING',
  EXPIRED = 'EXPIRED',
}

export enum PromotionTarget {
  TREATMENT = 'TREATMENT',
  CATEGORY = 'CATEGORY',
}

export class FindPromotionsQueryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  treatmentId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  currentlyValid?: boolean;

  @IsOptional()
  @IsEnum(PromotionValidity)
  validity?: PromotionValidity;

  @IsOptional()
  @IsEnum(PromotionTarget)
  appliesTo?: PromotionTarget;

  @IsOptional()
  @IsUUID()
  withinCategoryId?: string;
}
