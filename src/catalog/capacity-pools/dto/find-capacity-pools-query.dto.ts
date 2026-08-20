import { IsUUID } from 'class-validator';

export class FindCapacityPoolsQueryDto {
  @IsUUID()
  categoryId: string;
}
