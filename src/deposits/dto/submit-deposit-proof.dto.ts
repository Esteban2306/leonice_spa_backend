import { IsString, MinLength } from 'class-validator';
export class SubmitDepositProofDto {
  @IsString()
  @MinLength(10)
  phone: string;
}
