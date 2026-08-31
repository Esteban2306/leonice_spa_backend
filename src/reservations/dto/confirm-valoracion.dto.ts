import { IsNumber, Min } from 'class-validator';

export class ConfirmValoracionDto {
  @IsNumber()
  @Min(0)
  finalPrice: number;

  @IsNumber()
  @Min(1)
  finalDurationMinutes: number;
}
