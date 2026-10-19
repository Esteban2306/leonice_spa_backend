import {
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCapacityPoolDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MaxLength(100)
  @MinLength(2)
  name: string;

  @IsInt()
  @Min(1)
  maxConcurrent: number;
}
