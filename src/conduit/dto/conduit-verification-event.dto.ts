import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ConduitVerificationEventDataDto {
  @IsString()
  @MaxLength(100)
  verificationId: string;

  @IsString()
  @MaxLength(100)
  conversationId: string;

  @IsString()
  @MaxLength(50)
  capability: string;

  @IsString()
  @MaxLength(30)
  verdict: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contact?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reasonCodes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  botConfigId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialistId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mode?: string;

  @IsOptional()
  @IsNumber()
  confidence?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  humanSummary?: string | null;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class ConduitVerificationEventDto {
  @IsString()
  @MaxLength(100)
  event: string;

  @IsISO8601()
  timestamp: string;

  @ValidateNested()
  @Type(() => ConduitVerificationEventDataDto)
  data: ConduitVerificationEventDataDto;
}
