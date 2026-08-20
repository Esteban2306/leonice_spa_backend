import { IsUUID } from 'class-validator';

export class CreateRecommendationDto {
  @IsUUID()
  treatmentId: string;

  @IsUUID()
  productId: string;
}
