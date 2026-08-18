import { IsDateString, IsUUID } from 'class-validator';

export class GetAvailabilityDto {
  @IsUUID()
  treatmentId: string;

  @IsDateString()
  date: string;
}
