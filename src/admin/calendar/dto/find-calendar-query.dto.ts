import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/date-input.validators';

export class FindCalendarQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
