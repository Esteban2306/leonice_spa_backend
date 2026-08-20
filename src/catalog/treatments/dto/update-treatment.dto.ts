import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTreatmentDto } from './create-treatment.dto';

export class UpdateTreatmentDto extends PartialType(CreateTreatmentDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
