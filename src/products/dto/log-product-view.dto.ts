import { IsString, MaxLength, MinLength } from 'class-validator';
export class LogProductViewDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone: string;
}
