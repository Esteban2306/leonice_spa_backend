import { IsString, MaxLength, MinLength } from 'class-validator';

export class FindRecommendedForClientQueryDto {
  @IsString()
  @MaxLength(32)
  @MinLength(10)
  phone!: string;
}
