import { IsString, MinLength } from 'class-validator';
export class RejectDepositDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
