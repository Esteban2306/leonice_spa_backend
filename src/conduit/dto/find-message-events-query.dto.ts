import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConduitMessageStatus } from '@prisma/client';

export class FindMessageEventsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  messageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyEventId?: string;

  @IsOptional()
  @IsEnum(ConduitMessageStatus)
  status?: ConduitMessageStatus;
}
