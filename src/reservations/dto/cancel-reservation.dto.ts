import { IsOptional, IsString, MinLength } from 'class-validator';
export class CancelReservationDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
