import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsUUID()
  productCategoryId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
