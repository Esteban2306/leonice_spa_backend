import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ConduitProductPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone?: string;

  @IsString()
  imageBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  pedido?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  montoComprobante?: number;
}
