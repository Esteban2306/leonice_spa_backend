import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCapacityPoolDto } from './create-capacity-pool.dto';

export class UpdateCapacityPoolDto extends PartialType(CreateCapacityPoolDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
