import { IsCalendarDate } from '../../../common/validation/date-input.validators';
import { ScheduleExceptionType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleExceptionDto {
  @IsCalendarDate()
  date!: string;

  @IsEnum(ScheduleExceptionType)
  type!: ScheduleExceptionType;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'startTime debe tener formato HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'endTime debe tener formato HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
