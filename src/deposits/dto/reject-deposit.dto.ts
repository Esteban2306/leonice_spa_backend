import { IsString, MaxLength, MinLength } from 'class-validator';
export class RejectDepositDto {
  @IsString()
  @MaxLength(500)
  @MinLength(3)
  reason: string;
}
