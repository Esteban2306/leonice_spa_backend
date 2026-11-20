import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_QUOTE_COP, MIN_QUOTE_COP } from '../quotes/team-quote';

export class ConduitTeamQuoteDto {
  /** Lo pone Conduit (teléfono verificado del chat); el modelo no lo ve. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  treatmentName!: string;

  @IsInt()
  @Min(MIN_QUOTE_COP)
  @Max(MAX_QUOTE_COP)
  price!: number;
}
