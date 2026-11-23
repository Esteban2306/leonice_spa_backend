import { IsInt, Max, Min } from 'class-validator';

export class SetProductOrderTotalDto {
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  total!: number;
}
