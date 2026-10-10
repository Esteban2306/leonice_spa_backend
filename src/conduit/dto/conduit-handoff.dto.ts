import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConduitHandoffDto {
  /** Lo pone Conduit (teléfono verificado del chat); el modelo no lo ve. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  phone?: string;

  /** Por qué se pasa a una persona (pedido de la clienta, queja, salud…). */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  /** Resumen breve para que el equipo no tenga que preguntar todo de nuevo. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;
}
