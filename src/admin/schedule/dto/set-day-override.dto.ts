import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/date-input.validators';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayOverrideWindowDto {
  @Matches(TIME_OF_DAY, { message: 'startTime debe tener formato HH:mm' })
  startTime!: string;

  @Matches(TIME_OF_DAY, { message: 'endTime debe tener formato HH:mm' })
  endTime!: string;
}

export class SetDayOverrideDto {
  @IsCalendarDate()
  from!: string;

  @IsCalendarDate()
  to!: string;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => DayOverrideWindowDto)
  windows!: DayOverrideWindowDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @Matches(TIME_OF_DAY, {
    each: true,
    message: 'Cada hora de inicio debe tener formato HH:mm',
  })
  startTimes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
