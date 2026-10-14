import { IsString, MaxLength, MinLength } from 'class-validator';
import { CollapseWhitespace } from './collapse-whitespace.transform';

export class CreateProductCategoryDto {
  @CollapseWhitespace()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}
