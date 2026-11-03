import { ClientTagKey } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AudienceFilterDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(ClientTagKey, { each: true })
  tags?: ClientTagKey[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(ClientTagKey, { each: true })
  excludeTags?: ClientTagKey[];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  treatmentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1095)
  visitedWithinDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1095)
  notVisitedForDays?: number;
}

export class PreviewAudienceDto {
  @ValidateNested()
  @Type(() => AudienceFilterDto)
  filter: AudienceFilterDto;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}
