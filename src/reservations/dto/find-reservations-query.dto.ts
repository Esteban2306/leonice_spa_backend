import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ReservationStatus } from '@prisma/client';

export class FindReservationsQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}
