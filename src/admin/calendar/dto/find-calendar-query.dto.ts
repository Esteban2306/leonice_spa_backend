import { IsCalendarDate } from '../../../common/validation/date-input.validators';
import {} from 'class-validator';

export class FindCalendarQueryDto {
  @IsCalendarDate()
  date: string;
}
