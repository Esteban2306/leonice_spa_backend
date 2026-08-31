import { IsNumber, Min } from 'class-validator';

export class UpsertTreatmentHairPricingDto {
  @IsNumber() @Min(0) priceCorto: number;
  @IsNumber() @Min(0) priceMediano: number;
  @IsNumber() @Min(0) priceLargo: number;

  @IsNumber() @Min(1) durationCortoMinutes: number;
  @IsNumber() @Min(1) durationMedianoMinutes: number;
  @IsNumber() @Min(1) durationLargoMinutes: number;

  @IsNumber() @Min(0) colorClaroSurcharge: number;
  @IsNumber() @Min(0) colorClaroDurationMinutes: number;
}
