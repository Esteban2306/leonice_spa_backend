import { IsCalendarDate } from '../../../common/validation/date-input.validators';
import { IsOptional, IsUUID } from 'class-validator';

export class FindScheduleExceptionsQueryDto {
  @IsCalendarDate()
  from!: string;

  @IsCalendarDate()
  to!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
