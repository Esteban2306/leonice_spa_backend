import { IsString, MinLength } from 'class-validator';

export class FindRecommendedForClientQueryDto {
  @IsString()
  @MinLength(10)
  phone!: string;
}
