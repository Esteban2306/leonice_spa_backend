import { IsUUID } from 'class-validator';

export class FindClientCreditsQueryDto {
  @IsUUID()
  clientId!: string;
}
