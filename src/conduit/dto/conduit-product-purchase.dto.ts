import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConduitProductPurchaseDto {
  /** Lo pone Conduit (teléfono verificado del chat); el modelo no lo ve. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone?: string;

  /** Producto, presentación y cantidad que la clienta quiere comprar. */
  @IsString()
  @MinLength(3)
  @MaxLength(400)
  request!: string;

  /** Algo más que el equipo deba saber (para qué lo quiere, cuándo pasa). */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;
}
