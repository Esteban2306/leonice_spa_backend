import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsInt()
  @Min(0)
  cooldownDays: number;
}
