import { IsDateString } from 'class-validator';

export class FindCalendarQueryDto {
  @IsDateString()
  date: string;
}
