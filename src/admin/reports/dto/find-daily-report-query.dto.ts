import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/date-input.validators';

export class FindDailyReportQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
