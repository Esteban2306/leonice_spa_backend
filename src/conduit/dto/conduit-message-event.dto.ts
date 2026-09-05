import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConduitMessageStatus } from '@prisma/client';

class ConduitMessageEventDataDto {
  @IsString()
  messageId: string;

  @IsString()
  channel: string;

  @IsString()
  recipient: string;

  @IsEnum(ConduitMessageStatus)
  status: ConduitMessageStatus;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @IsOptional()
  @IsString()
  error?: string | null;

  @IsOptional()
  @IsObject()
  meta?: { companyEventId?: string };
}

export class ConduitMessageEventDto {
  @IsString()
  event: string;

  @IsISO8601()
  timestamp: string;

  @ValidateNested()
  @Type(() => ConduitMessageEventDataDto)
  data: ConduitMessageEventDataDto;
}
