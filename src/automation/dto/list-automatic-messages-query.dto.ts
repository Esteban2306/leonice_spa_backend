import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListAutomaticMessagesQueryDto {
  @IsOptional()
  @IsIn(['REMINDER', 'FOLLOW_UP'])
  kind?: 'REMINDER' | 'FOLLOW_UP';

  @IsOptional()
  @IsIn(['EXECUTED', 'SKIPPED', 'FAILED'])
  result?: 'EXECUTED' | 'SKIPPED' | 'FAILED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
