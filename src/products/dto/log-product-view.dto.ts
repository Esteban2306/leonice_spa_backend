import { IsString, MinLength } from 'class-validator';
export class LogProductViewDto {
  @IsString()
  @MinLength(10)
  phone: string;
}
