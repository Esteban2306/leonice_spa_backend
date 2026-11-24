import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_ITEM_QUANTITY,
  MAX_ORDER_ITEMS,
} from '../../product-orders/domain/order-pricing';

export const FULFILLMENTS = ['DOMICILIO', 'RECOGER'] as const;
export const PAYMENTS = [
  'TRANSFERENCIA',
  'CONTRAENTREGA',
  'EN_TIENDA',
] as const;

export class ConduitPurchaseItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  producto!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  presentacion?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  cantidad!: number;
}

export class ConduitProductPurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ConduitPurchaseItemDto)
  items?: ConduitPurchaseItemDto[];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(400)
  request?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;

  @IsOptional()
  @IsIn(FULFILLMENTS)
  entrega?: (typeof FULFILLMENTS)[number];

  @IsOptional()
  @IsIn(PAYMENTS)
  pago?: (typeof PAYMENTS)[number];

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  direccion?: string;
}
