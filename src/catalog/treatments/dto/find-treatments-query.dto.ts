import { IsOptional, IsUUID } from 'class-validator';

export class FindTreatmentsQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
