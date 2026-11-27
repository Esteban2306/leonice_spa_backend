import { IsNumber, Max, Min } from 'class-validator';
import {
  MAX_PRICE_COP,
  MIN_PRICE_COP,
  PRICE_RANGE_MESSAGE,
  priceUnitsOf,
} from '../../common/money/price-units';

export class ConfirmValoracionDto {
  /** En miles de COP, como el catálogo (350 = $350.000). */
  @IsNumber()
  @Min(priceUnitsOf(MIN_PRICE_COP), { message: PRICE_RANGE_MESSAGE })
  @Max(priceUnitsOf(MAX_PRICE_COP), { message: PRICE_RANGE_MESSAGE })
  finalPrice: number;

  @IsNumber()
  @Min(1)
  finalDurationMinutes: number;
}
