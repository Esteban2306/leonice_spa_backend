import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const CONDUIT_OPS_ALERT_EVENT = 'ops.alert';

class ConduitOpsAlertDataDto {
  @IsString()
  @MaxLength(50)
  kind: string;

  @IsString()
  @MaxLength(300)
  subject: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  lines: string[];
}

export class ConduitOpsAlertEventDto {
  @IsIn([CONDUIT_OPS_ALERT_EVENT])
  event: typeof CONDUIT_OPS_ALERT_EVENT;

  @IsISO8601()
  timestamp: string;

  @ValidateNested()
  @Type(() => ConduitOpsAlertDataDto)
  data: ConduitOpsAlertDataDto;
}
