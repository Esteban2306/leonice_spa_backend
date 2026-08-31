import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AdminCancelReservationDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}
