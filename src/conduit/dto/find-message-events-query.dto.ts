import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ConduitMessageStatus } from '@prisma/client';

export class FindMessageEventsQueryDto {
  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  companyEventId?: string;

  @IsOptional()
  @IsEnum(ConduitMessageStatus)
  status?: ConduitMessageStatus;
}
