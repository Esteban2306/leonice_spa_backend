import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_WINDOWS_PER_DAY } from '../../../reservations/domain/weekly-schedule';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

class BaseScheduleWindowDto {
  @Matches(TIME_OF_DAY, { message: 'startTime debe tener formato HH:mm' })
  startTime!: string;

  @Matches(TIME_OF_DAY, { message: 'endTime debe tener formato HH:mm' })
  endTime!: string;
}

class BaseScheduleDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsArray()
  @ArrayMaxSize(MAX_WINDOWS_PER_DAY)
  @ValidateNested({ each: true })
  @Type(() => BaseScheduleWindowDto)
  windows!: BaseScheduleWindowDto[];
}

export class UpdateBaseScheduleDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BaseScheduleDayDto)
  days!: BaseScheduleDayDto[];
}
