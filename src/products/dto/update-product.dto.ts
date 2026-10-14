import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['tagIds', 'variants'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
