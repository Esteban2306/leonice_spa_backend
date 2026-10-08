import { IsZonedDateTime } from '../../common/validation/date-input.validators';
import { IsString, MinLength } from 'class-validator';
export class RescheduleReservationDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsZonedDateTime()
  newScheduledStart: string;
}
