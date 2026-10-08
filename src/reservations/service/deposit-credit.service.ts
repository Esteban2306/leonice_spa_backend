import { Injectable } from '@nestjs/common';
import {
  DepositStatus,
  Prisma,
  PrismaClient,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MIN_ADVANCE_AMOUNT } from '../domain/advance-payment.constants';
import {
  CREDIT_ORIGIN_STATUSES,
  CREDIT_RELEASING_STATUSES,
  effectiveAppliedStatus,
  selectAvailableCredits,
  type CreditCandidate,
} from '../domain/select-available-credits';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export interface ClientCreditSummary {
  clientId: string;
  credits: Array<{
    depositId: string;
    amount: number | null;
    originReservationId: string;
    originStatus: ReservationStatus;
    confirmedAt: Date;
  }>;
}

@Injectable()
export class DepositCreditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailableForClient(
    clientId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<CreditCandidate[]> {
    const rows = await client.depositRecord.findMany({
      where: {
        status: DepositStatus.CONFIRMADO,
        imageUrl: { not: null },
        amount: { not: null },
        reservation: {
          clientId,
          status: { in: [...CREDIT_ORIGIN_STATUSES] },
        },
      },
      select: {
        id: true,
        reservationId: true,
        amount: true,
        status: true,
        imageUrl: true,
        verifiedAt: true,
        createdAt: true,
        appliedToReservationId: true,
        appliedToReservation: { select: { status: true, comboGroupId: true } },
        reservation: { select: { status: true } },
        coveredReservations: { select: { status: true } },
      },
    });

    const candidates: CreditCandidate[] = [];
    for (const row of rows) {
      const destination = row.appliedToReservation;
      candidates.push({
        depositId: row.id,
        originReservationId: row.reservationId,
        amount: row.amount === null ? null : row.amount.toNumber(),
        status: row.status,
        hasProofImage: row.imageUrl !== null,
        originStatus: row.reservation.status,
        coveredStatuses: row.coveredReservations.map((r) => r.status),
        appliedToReservationId: row.appliedToReservationId,
        appliedToStatus: destination
          ? await this.resolveEffectiveStatus(destination, client)
          : null,
        confirmedAt: row.verifiedAt ?? row.createdAt,
      });
    }

    return selectAvailableCredits(candidates, MIN_ADVANCE_AMOUNT);
  }

  async summarizeForClient(clientId: string): Promise<ClientCreditSummary> {
    const credits = await this.findAvailableForClient(clientId);
    return {
      clientId,
      credits: credits.map((c) => ({
        depositId: c.depositId,
        amount: c.amount,
        originReservationId: c.originReservationId,
        originStatus: c.originStatus,
        confirmedAt: c.confirmedAt,
      })),
    };
  }

  async applyToReservation(
    client: PrismaClientOrTx,
    depositId: string,
    expectedAppliedTo: string | null,
    reservationId: string,
  ): Promise<boolean> {
    const result = await client.depositRecord.updateMany({
      where: { id: depositId, appliedToReservationId: expectedAppliedTo },
      data: { appliedToReservationId: reservationId },
    });
    return result.count === 1;
  }

  async isCoveredByCredit(
    reservation: { id: string; comboGroupId: string | null },
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const ids = [reservation.id];
    if (reservation.comboGroupId !== null) {
      const members = await client.reservation.findMany({
        where: { comboGroupId: reservation.comboGroupId },
        select: { id: true },
      });
      ids.push(...members.map((m) => m.id));
    }

    const count = await client.depositRecord.count({
      where: { appliedToReservationId: { in: ids } },
    });
    return count > 0;
  }

  async isDepositCommittedElsewhere(
    reservationId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const rows = await client.depositRecord.findMany({
      where: { reservationId, appliedToReservationId: { not: null } },
      select: {
        appliedToReservation: { select: { status: true, comboGroupId: true } },
      },
    });

    for (const row of rows) {
      if (!row.appliedToReservation) continue;
      const status = await this.resolveEffectiveStatus(
        row.appliedToReservation,
        client,
      );
      if (!CREDIT_RELEASING_STATUSES.includes(status)) return true;
    }
    return false;
  }

  private async resolveEffectiveStatus(
    destination: { status: ReservationStatus; comboGroupId: string | null },
    client: PrismaClientOrTx,
  ): Promise<ReservationStatus> {
    if (destination.comboGroupId === null) return destination.status;

    const siblings = await client.reservation.findMany({
      where: { comboGroupId: destination.comboGroupId },
      select: { status: true },
    });
    return (
      effectiveAppliedStatus(siblings.map((s) => s.status)) ??
      destination.status
    );
  }
}
