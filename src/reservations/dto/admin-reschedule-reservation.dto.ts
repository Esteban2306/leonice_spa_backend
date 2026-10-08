import { IsZonedDateTime } from '../../common/validation/date-input.validators';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AdminRescheduleReservationDto {
  @IsZonedDateTime()
  newScheduledStart: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;

  @IsOptional()
  @IsString()
  internalNote?: string;
}
