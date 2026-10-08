import { DepositCoverage } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
} from 'class-validator';

export const APPROVE_SCOPES = ['GROUP', 'SINGLE'] as const;
export type ApproveScope = (typeof APPROVE_SCOPES)[number];

export class ApproveDepositDto {
  @IsEnum(DepositCoverage)
  coverage!: DepositCoverage;

  /**
   * Monto real que entregó el cliente, en miles de COP. Obligatorio cuando se
   * registra dinero (el orquestador responde DEPOSIT_AMOUNT_REQUIRED); solo se
   * omite al confirmar reservas ya cubiertas por crédito. Sin mínimo: decide el admin.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000)
  amount?: number;

  @IsOptional()
  @IsIn(APPROVE_SCOPES)
  scope?: ApproveScope;
}
