import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConduitMessageStatus } from '@prisma/client';

class ConduitMessageEventDataDto {
  @IsString()
  @MaxLength(200)
  messageId: string;

  @IsString()
  @MaxLength(50)
  channel: string;

  @IsString()
  @MaxLength(200)
  recipient: string;

  @IsEnum(ConduitMessageStatus)
  status: ConduitMessageStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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
  @MaxLength(100)
  event: string;

  @IsISO8601()
  timestamp: string;

  @ValidateNested()
  @Type(() => ConduitMessageEventDataDto)
  data: ConduitMessageEventDataDto;
}
