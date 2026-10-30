import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CompleteReservationDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  cashAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  transferAmount!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  advanceAmount?: number;
}
