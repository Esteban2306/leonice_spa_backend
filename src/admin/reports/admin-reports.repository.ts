import { Injectable } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

interface DayRange {
  dayStart: Date;
  dayEnd: Date;
}

@Injectable()
export class AdminReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findScheduledOn({ dayStart, dayEnd }: DayRange) {
    return this.prisma.client.reservation.findMany({
      where: { scheduledStart: { gte: dayStart, lt: dayEnd } },
      select: {
        status: true,
        cancellationSource: true,
        finalPrice: true,
        treatment: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  findCreatedOn({ dayStart, dayEnd }: DayRange) {
    return this.prisma.client.reservation.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      select: { channel: true },
    });
  }

  findDepositsReviewedOn({ dayStart, dayEnd }: DayRange) {
    return this.prisma.client.depositRecord.findMany({
      where: {
        verifiedAt: { gte: dayStart, lt: dayEnd },
        status: {
          in: [
            DepositStatus.CONFIRMADO,
            DepositStatus.CONVERTIDO_A_CREDITO,
            DepositStatus.RECHAZADO,
          ],
        },
      },
      select: { status: true, amount: true },
    });
  }

  countClientsCreatedOn({ dayStart, dayEnd }: DayRange) {
    return this.prisma.client.client.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    });
  }

  findScheduledWithAssessmentData({ dayStart, dayEnd }: DayRange) {
    return this.prisma.client.reservation.findMany({
      where: { scheduledStart: { gte: dayStart, lt: dayEnd } },
      select: {
        status: true,
        scheduledStart: true,
        treatment: {
          select: {
            requiresPriorAssessment: true,
            hasHairVariablePricing: true,
          },
        },
        client: {
          select: {
            hairLength: true,
            hairColor: true,
            hairProfileUpdatedAt: true,
          },
        },
      },
    });
  }

  countPendingDeposits() {
    return this.prisma.client.reservation.count({
      where: { status: ReservationStatus.PENDIENTE_DEPOSITO },
    });
  }
}
