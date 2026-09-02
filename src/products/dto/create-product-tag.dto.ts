import { IsBoolean, IsString, MinLength } from 'class-validator';

export class CreateProductTagDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsBoolean()
  isActive?: boolean;
}
