import { IsInt, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateCapacityPoolDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsInt()
  @Min(1)
  maxConcurrent: number;
}
