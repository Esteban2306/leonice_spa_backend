import { Injectable, NotFoundException } from '@nestjs/common';
import { DepositStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { balanceDue } from '../domain/payment-settlement';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export interface ReservationSettlement {
  reservationId: string;
  price: number;
  advance: number | null;
  advanceShared: boolean;
  balanceDue: number | null;
}

@Injectable()
export class ReservationSettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(
    reservationId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<ReservationSettlement> {
    const reservation = await client.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        finalPrice: true,
        comboGroupId: true,
        coveredByDepositId: true,
      },
    });
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    const price = reservation.finalPrice.toNumber();

    const own = await client.depositRecord.findMany({
      where: {
        reservationId,
        status: DepositStatus.CONFIRMADO,
        OR: [
          { appliedToReservationId: null },
          { appliedToReservationId: reservationId },
        ],
      },
      select: { amount: true, coveredReservations: { select: { id: true } } },
    });
    const applied = await client.depositRecord.findMany({
      where: {
        appliedToReservationId: reservationId,
        reservationId: { not: reservationId },
        status: DepositStatus.CONFIRMADO,
      },
      select: { amount: true },
    });

    const deposits = [...own, ...applied];
    const coversOthers = own.some((d) => d.coveredReservations.length > 0);
    const missingAmount = deposits.some((d) => d.amount === null);
    const appliedToSibling = await this.hasDepositAppliedToSibling(
      reservation,
      client,
    );

    const advanceShared =
      reservation.coveredByDepositId !== null ||
      coversOthers ||
      missingAmount ||
      appliedToSibling;

    if (advanceShared) {
      return {
        reservationId,
        price,
        advance: null,
        advanceShared: true,
        balanceDue: null,
      };
    }

    const advance = deposits.reduce(
      (sum, d) => sum + (d.amount?.toNumber() ?? 0),
      0,
    );
    return {
      reservationId,
      price,
      advance,
      advanceShared: false,
      balanceDue: balanceDue(price, advance),
    };
  }

  private async hasDepositAppliedToSibling(
    reservation: { id: string; comboGroupId: string | null },
    client: PrismaClientOrTx,
  ): Promise<boolean> {
    if (reservation.comboGroupId === null) return false;
    const siblings = await client.reservation.findMany({
      where: {
        comboGroupId: reservation.comboGroupId,
        id: { not: reservation.id },
      },
      select: { id: true },
    });
    if (siblings.length === 0) return false;
    const count = await client.depositRecord.count({
      where: {
        appliedToReservationId: { in: siblings.map((s) => s.id) },
        status: DepositStatus.CONFIRMADO,
      },
    });
    return count > 0;
  }
}
