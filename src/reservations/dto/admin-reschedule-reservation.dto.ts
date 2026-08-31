import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class AdminRescheduleReservationDto {
  @IsDateString()
  newScheduledStart: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;

  @IsOptional()
  @IsString()
  internalNote?: string;
}
