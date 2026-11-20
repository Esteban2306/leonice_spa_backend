import { IsBoolean } from 'class-validator';

export class SetDepositExemptDto {
  @IsBoolean()
  depositExempt: boolean;
}
