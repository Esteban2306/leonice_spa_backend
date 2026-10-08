import { IsZonedDateTime } from '../../common/validation/date-input.validators';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage: number;

  @IsZonedDateTime()
  startsAt: string;

  @IsZonedDateTime()
  endsAt: string;

  @IsOptional()
  @IsUUID()
  treatmentId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
