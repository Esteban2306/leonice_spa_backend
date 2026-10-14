import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CollapseWhitespace } from './collapse-whitespace.transform';

export class CreateProductTagDto {
  @CollapseWhitespace()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
