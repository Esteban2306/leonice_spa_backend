import { IsDateString, IsString, MinLength } from 'class-validator';
export class RescheduleReservationDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsDateString()
  newScheduledStart: string;
}
