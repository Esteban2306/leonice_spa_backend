import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Campos opcionales: solo se actualiza lo que se envía; `null` borra. */
export class UpdateBusinessSettingsDto {
  /** Anticipo en miles de COP (35 = $35.000). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  depositAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  depositInstructions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  depositPolicy?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  cancellationPolicy?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalInfo?: string | null;
}
