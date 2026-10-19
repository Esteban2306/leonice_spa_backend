import { IsZonedDateTime } from '../../common/validation/date-input.validators';
import { IsString, MaxLength, MinLength } from 'class-validator';
export class RescheduleReservationDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone: string;

  @IsZonedDateTime()
  newScheduledStart: string;
}
