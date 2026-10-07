import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DepositCoverage,
  DepositRecord,
  DepositStatus,
  Prisma,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { ConfirmDepositOrchestrator } from '../../reservations/orchestrators/confirm-deposit.orchestrator';
import { DepositCreditService } from 'src/reservations/service/deposit-credit.service';
import {
  MIN_ADVANCE_AMOUNT,
  toCop,
} from '../../reservations/domain/advance-payment.constants';
import { getDayBoundaries } from '../../reservations/domain/day-boundaries';
import { DomainException } from '../../common/exceptions/domain.exception';
import { resolveDepositAmount } from '../validators/resolve-deposit-amount';
import type { ApproveScope } from '../dto/approve-deposit.dto';

export interface ApproveDepositResult {
  approvedReservationIds: string[];
}

export const APPROVE_DEPOSIT_ERROR_CODES = {
  AMOUNT_REQUIRED: 'DEPOSIT_AMOUNT_REQUIRED',
  AMOUNT_BELOW_MINIMUM: 'DEPOSIT_AMOUNT_BELOW_MINIMUM',
} as const;

@Injectable()
export class ApproveDepositOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: DepositsRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly confirmDepositOrchestrator: ConfirmDepositOrchestrator,
    private readonly depositCredit: DepositCreditService,
  ) {}

  async execute(
    reservationId: string,
    adminUserId: string,
    coverage: DepositCoverage,
    requestedAmount?: number,
    scope: ApproveScope = 'GROUP',
  ): Promise<ApproveDepositResult> {
    const anchor = await this.reservationsRepository.findById(reservationId);
    if (!anchor) throw new NotFoundException('Reserva no encontrada');

    if (anchor.status !== ReservationStatus.PENDIENTE_DEPOSITO) {
      throw new DomainException(
        `Esta reserva no está esperando un depósito (estado actual: ${anchor.status})`,
      );
    }

    const group = scope === 'SINGLE' ? [anchor] : await this.findGroup(anchor);

    const confirmed = await this.prisma.client.$transaction(async (tx) => {
      const result: Reservation[] = [];

      for (const reservation of group) {
        const confirmedReservation =
          await this.confirmDepositOrchestrator.confirmStatus(
            reservation.id,
            tx,
          );

        const covered = await this.depositCredit.isCoveredByCredit(
          reservation,
          tx,
        );
        if (!covered) {
          const amount =
            reservation.id === anchor.id
              ? this.resolveAnchorAmount(coverage, requestedAmount)
              : MIN_ADVANCE_AMOUNT;
          const latest = await this.repository.findLatestByReservationId(
            reservation.id,
            tx,
          );
          await this.resolveConfirmedDeposit(
            latest,
            reservation.id,
            adminUserId,
            coverage,
            amount,
            tx,
          );
        }

        result.push(confirmedReservation);
      }

      return result;
    });

    for (const reservation of confirmed) {
      await this.confirmDepositOrchestrator.afterConfirmed(reservation);
    }

    return { approvedReservationIds: confirmed.map((r) => r.id) };
  }

  private findGroup(anchor: Reservation) {
    const { dayStart, dayEnd } = getDayBoundaries(anchor.scheduledStart);
    return this.reservationsRepository.findByClientAndDayWithStatus(
      anchor.clientId,
      dayStart,
      dayEnd,
      ReservationStatus.PENDIENTE_DEPOSITO,
    );
  }

  private resolveAnchorAmount(
    coverage: DepositCoverage,
    requested: number | undefined,
  ): number {
    const resolution = resolveDepositAmount({
      coverage,
      requested,
      minimum: MIN_ADVANCE_AMOUNT,
    });
    if (resolution.ok) return resolution.amount;

    if (resolution.reason === 'AMOUNT_REQUIRED_FOR_FULL_PAYMENT') {
      throw new BadRequestException({
        code: APPROVE_DEPOSIT_ERROR_CODES.AMOUNT_REQUIRED,
        message: 'Para registrar un pago completo debes indicar el monto.',
      });
    }
    throw new DomainException({
      code: APPROVE_DEPOSIT_ERROR_CODES.AMOUNT_BELOW_MINIMUM,
      message: `El monto no puede ser menor al adelanto mínimo ($${toCop(MIN_ADVANCE_AMOUNT).toLocaleString('es-CO')}).`,
      minimum: MIN_ADVANCE_AMOUNT,
      unit: 'THOUSANDS_COP',
    });
  }

  private resolveConfirmedDeposit(
    latest: DepositRecord | null,
    reservationId: string,
    adminUserId: string,
    coverage: DepositCoverage,
    amount: number,
    tx: Prisma.TransactionClient,
  ): Promise<DepositRecord> {
    if (!latest || latest.status === DepositStatus.RECHAZADO) {
      return this.repository.createConfirmedWithoutProof(
        reservationId,
        adminUserId,
        coverage,
        amount,
        tx,
      );
    }

    if (latest.status === DepositStatus.PENDIENTE) {
      return this.repository.markConfirmed(
        latest.id,
        adminUserId,
        coverage,
        amount,
        tx,
      );
    }

    if (latest.status === DepositStatus.CONFIRMADO) {
      return Promise.resolve(latest);
    }

    throw new DomainException(
      `Este comprobante ya fue procesado (estado: ${latest.status})`,
    );
  }
}
