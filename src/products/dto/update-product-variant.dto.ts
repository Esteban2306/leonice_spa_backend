import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductVariantDto } from './create-product-variant.dto';

export class UpdateProductVariantDto extends PartialType(
  CreateProductVariantDto,
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
