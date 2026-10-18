import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CollapseWhitespace } from 'src/products/dto/collapse-whitespace.transform';

export class CreateTestimonialDto {
  @CollapseWhitespace()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  authorName: string;

  @CollapseWhitespace()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  quote: string;

  @CollapseWhitespace()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  treatmentName: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @Equals(true, {
    message: 'Debes confirmar que la clienta autorizó publicar su testimonio.',
  })
  consentConfirmed: true;
}
