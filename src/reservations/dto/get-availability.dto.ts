import { IsCalendarDate } from '../../common/validation/date-input.validators';
import { IsUUID } from 'class-validator';

export class GetAvailabilityDto {
  @IsUUID()
  treatmentId: string;

  @IsCalendarDate()
  date: string;
}
