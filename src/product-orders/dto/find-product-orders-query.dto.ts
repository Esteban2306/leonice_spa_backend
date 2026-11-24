import { ProductOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const ORDER_VIEWS = ['TO_VERIFY'] as const;

export class FindProductOrdersQueryDto {
  @IsOptional()
  @IsEnum(ProductOrderStatus)
  status?: ProductOrderStatus;

  @IsOptional()
  @IsIn(ORDER_VIEWS)
  view?: (typeof ORDER_VIEWS)[number];

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 30;
}
