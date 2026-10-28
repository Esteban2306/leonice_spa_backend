import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitConduitDepositDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone: string;

  @IsString()
  @MaxLength(12000000)
  imageBase64: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;
}
