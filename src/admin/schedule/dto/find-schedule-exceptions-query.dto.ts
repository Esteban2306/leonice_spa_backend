import { IsOptional, IsUUID, Matches } from 'class-validator';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class FindScheduleExceptionsQueryDto {
  @Matches(DAY_KEY, { message: 'from debe tener formato YYYY-MM-DD' })
  from!: string;

  @Matches(DAY_KEY, { message: 'to debe tener formato YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
