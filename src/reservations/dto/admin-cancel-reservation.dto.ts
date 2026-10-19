import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminCancelReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}
