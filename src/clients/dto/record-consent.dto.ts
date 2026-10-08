import { ConsentType } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class RecordConsentDto {
  @IsEnum(ConsentType)
  type!: ConsentType;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  policyVersion!: string;
}
