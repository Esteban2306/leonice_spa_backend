import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AudienceFilterDto } from '../../audiences/dto/audience-filter.dto';
import { IsZonedDateTime } from '../../common/validation/date-input.validators';
import { MAX_MARKETING_COOLDOWN_DAYS } from '../../marketing/marketing-frequency';
import { MAX_PER_DAY_LIMIT } from '../domain/pacing';
import type { PaceProfile } from '../domain/pacing';

export const PACE_VALUES: readonly PaceProfile[] = [
  'SEGURO',
  'EQUILIBRADO',
  'RAPIDO',
];

export class EstimateCampaignDto {
  @IsString()
  templateCode: string;

  @IsOptional()
  @IsUUID()
  promotionId?: string;

  @ValidateNested()
  @Type(() => AudienceFilterDto)
  filter: AudienceFilterDto;

  @IsIn(PACE_VALUES)
  pace: PaceProfile;

  @IsOptional()
  @IsZonedDateTime()
  startAt?: string;
}

export class CreateCampaignDto extends EstimateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}

export class SendWindowDto {
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute: number;
}

export class UpdateCampaignSettingsDto {
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SendWindowDto)
  sendWindows: SendWindowDto[];

  @IsInt()
  @Min(10)
  @Max(MAX_PER_DAY_LIMIT)
  maxPerDay: number;

  @IsInt()
  @Min(0)
  @Max(MAX_MARKETING_COOLDOWN_DAYS)
  marketingCooldownDays: number;
}

export class ListCampaignRecipientsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'SENT', 'FAILED', 'SKIPPED'])
  status?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

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
