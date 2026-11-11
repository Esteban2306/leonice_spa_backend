import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetVerificationModeDto {
  @IsIn(['OFF', 'SHADOW', 'ACTIVE'])
  mode!: 'OFF' | 'SHADOW' | 'ACTIVE';
}

export class RotateModelKeyDto {
  @IsString()
  @MinLength(20)
  @MaxLength(400)
  apiKey!: string;
}

export class ReviewVerificationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
