import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdminCancelReservationDto {
  @ValidateIf((dto: AdminCancelReservationDto) => dto.notifyClient !== false)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}
