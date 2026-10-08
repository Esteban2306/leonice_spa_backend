import { Injectable, NotFoundException } from '@nestjs/common';
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
import { DepositCreditService } from '../../reservations/service/deposit-credit.service';
import { getDayBoundaries } from '../../reservations/domain/day-boundaries';
import { AppException } from '../../common/errors/app.exception';
import type { ApproveScope } from '../dto/approve-deposit.dto';

export interface ApproveDepositCommand {
  reservationId: string;
  adminUserId: string;
  coverage: DepositCoverage;
  amount?: number;
  scope?: ApproveScope;
}

export interface ApproveDepositResult {
  approvedReservationIds: string[];
  depositId: string | null;
}

@Injectable()
export class ApproveDepositOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: DepositsRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly confirmDepositOrchestrator: ConfirmDepositOrchestrator,
    private readonly depositCredit: DepositCreditService,
  ) {}

  async execute(command: ApproveDepositCommand): Promise<ApproveDepositResult> {
    const anchor = await this.reservationsRepository.findById(
      command.reservationId,
    );
    if (!anchor) throw new NotFoundException('Reserva no encontrada');

    if (anchor.status !== ReservationStatus.PENDIENTE_DEPOSITO) {
      return this.approvePendingProofOnly(anchor, command);
    }
    return this.approveAndConfirm(anchor, command);
  }

  private async approveAndConfirm(
    anchor: Reservation,
    command: ApproveDepositCommand,
  ): Promise<ApproveDepositResult> {
    const group =
      (command.scope ?? 'GROUP') === 'SINGLE'
        ? [anchor]
        : await this.findGroup(anchor);

    const { confirmed, depositId } = await this.prisma.client.$transaction(
      async (tx) => {
        const confirmedRows: Reservation[] = [];
        const needsPayment: Reservation[] = [];

        for (const reservation of group) {
          confirmedRows.push(
            await this.confirmDepositOrchestrator.confirmStatus(
              reservation.id,
              tx,
            ),
          );
          const coveredByCredit = await this.depositCredit.isCoveredByCredit(
            reservation,
            tx,
          );
          if (!coveredByCredit) needsPayment.push(reservation);
        }

        if (needsPayment.length === 0) {
          return { confirmed: confirmedRows, depositId: null };
        }

        const amount = this.requireAmount(command.amount);
        const payer =
          needsPayment.find((r) => r.id === anchor.id) ?? needsPayment[0];
        const latest = await this.repository.findLatestByReservationId(
          payer.id,
          tx,
        );
        const deposit = await this.resolveConfirmedDeposit(
          latest,
          payer.id,
          command,
          amount,
          tx,
        );

        const coveredIds = needsPayment
          .filter((r) => r.id !== payer.id)
          .map((r) => r.id);
        await this.reservationsRepository.setCoveredByDeposit(
          coveredIds,
          deposit.id,
          tx,
        );

        return { confirmed: confirmedRows, depositId: deposit.id };
      },
    );

    for (const reservation of confirmed) {
      await this.confirmDepositOrchestrator.afterConfirmed(reservation);
    }

    return {
      approvedReservationIds: confirmed.map((r) => r.id),
      depositId,
    };
  }

  private async approvePendingProofOnly(
    reservation: Reservation,
    command: ApproveDepositCommand,
  ): Promise<ApproveDepositResult> {
    const latest = await this.repository.findLatestByReservationId(
      reservation.id,
    );
    if (!latest || latest.status !== DepositStatus.PENDIENTE) {
      throw new AppException('DEPOSIT_NOT_PENDING', {
        details: {
          reservationId: reservation.id,
          reservationStatus: reservation.status,
          depositStatus: latest?.status ?? null,
        },
      });
    }

    const amount = this.requireAmount(command.amount);
    const applied = await this.repository.markConfirmedIfPending(
      latest.id,
      command.adminUserId,
      command.coverage,
      amount,
    );
    if (!applied) {
      throw new AppException('DEPOSIT_CONCURRENT_CHANGE', {
        details: { depositId: latest.id },
      });
    }

    return { approvedReservationIds: [], depositId: latest.id };
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

  private requireAmount(amount: number | undefined): number {
    if (amount === undefined) {
      throw new AppException('DEPOSIT_AMOUNT_REQUIRED');
    }
    return amount;
  }

  private resolveConfirmedDeposit(
    latest: DepositRecord | null,
    reservationId: string,
    command: ApproveDepositCommand,
    amount: number,
    tx: Prisma.TransactionClient,
  ): Promise<DepositRecord> {
    if (!latest || latest.status === DepositStatus.RECHAZADO) {
      return this.repository.createConfirmedWithoutProof(
        reservationId,
        command.adminUserId,
        command.coverage,
        amount,
        tx,
      );
    }

    if (latest.status === DepositStatus.PENDIENTE) {
      return this.repository.markConfirmed(
        latest.id,
        command.adminUserId,
        command.coverage,
        amount,
        tx,
      );
    }

    if (latest.status === DepositStatus.CONFIRMADO) {
      return Promise.resolve(latest);
    }

    throw new AppException('DEPOSIT_NOT_PENDING', {
      details: { reservationId, depositStatus: latest.status },
    });
  }
}
