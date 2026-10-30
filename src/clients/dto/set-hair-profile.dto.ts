import { HairColor, HairDensity, HairLength } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetHairProfileDto {
  @IsEnum(HairLength)
  hairLength!: HairLength;

  @IsEnum(HairColor)
  hairColor!: HairColor;

  @IsEnum(HairDensity)
  hairDensity!: HairDensity;
}
