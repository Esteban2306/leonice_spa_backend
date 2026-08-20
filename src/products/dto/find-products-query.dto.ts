import { IsOptional, IsUUID } from 'class-validator';

export class FindProductsQueryDto {
  @IsOptional()
  @IsUUID()
  productCategoryId?: string;
}
