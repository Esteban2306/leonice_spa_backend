import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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
  productPaymentInstructions?: string | null;

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

  /** Lo que el bot dice de la valoración capilar; vacío = no la menciona. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  assessmentOffer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^\+?[0-9][0-9 ]{6,28}$/, {
    message: 'El WhatsApp de Leo solo admite dígitos, espacios y un + inicial',
  })
  ownerContactPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  depositReminderEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  leadFollowUpEnabled?: boolean;
}
