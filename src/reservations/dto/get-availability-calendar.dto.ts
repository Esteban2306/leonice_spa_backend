import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validation/date-input.validators';

export const AVAILABILITY_PURPOSES = ['CREATE', 'RESCHEDULE'] as const;
export type AvailabilityPurpose = (typeof AVAILABILITY_PURPOSES)[number];

export class GetAvailabilityCalendarDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  treatmentIds!: string[];

  @IsCalendarDate()
  from!: string;

  @IsCalendarDate()
  to!: string;

  @IsOptional()
  @IsIn(AVAILABILITY_PURPOSES)
  purpose?: AvailabilityPurpose;
}
