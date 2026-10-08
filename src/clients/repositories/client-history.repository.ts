import { Injectable } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UPCOMING_STATUSES } from '../domain/client-view';
@Injectable()
export class clientsHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getReservationHistory(clientId: string, now: Date = new Date()) {
    const [reservations, statusCounts, upcoming, consentRecords] =
      await Promise.all([
        this.prisma.client.reservation.findMany({
          where: { clientId },
          orderBy: { scheduledStart: 'desc' },
          take: 20,
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            finalPrice: true,
            comboGroupId: true,
            cancellationSource: true,
            treatment: { select: { name: true } },
            category: { select: { name: true } },
          },
        }),
        this.prisma.client.reservation.groupBy({
          by: ['status'],
          where: { clientId },
          _count: { _all: true },
        }),
        this.prisma.client.reservation.count({
          where: {
            clientId,
            status: { in: [...UPCOMING_STATUSES] },
            scheduledStart: { gte: now },
          },
        }),
        this.prisma.client.consentRecord.findMany({
          where: { clientId },
          orderBy: { consentedAt: 'desc' },
          select: { type: true, policyVersion: true, consentedAt: true },
        }),
      ]);

    return {
      reservations,
      statusCounts: statusCounts.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      upcoming,
      consentRecords,
    };
  }

  async getLastCompletedReservation(clientId: string) {
    return this.prisma.client.reservation.findFirst({
      where: { clientId, status: ReservationStatus.COMPLETADA },
      orderBy: { completedAt: 'desc' },
      include: { treatment: true, category: true },
    });
  }

  async getMostFrequentTreatment(clientId: string) {
    const grouped = await this.prisma.client.reservation.groupBy({
      by: ['treatmentId'],
      where: { clientId, status: ReservationStatus.COMPLETADA },
      _count: { treatmentId: true },
      orderBy: { _count: { treatmentId: 'desc' } },
      take: 1,
    });

    if (grouped.length === 0) return null;
    return this.prisma.client.treatment.findUnique({
      where: { id: grouped[0].treatmentId },
    });
  }
}
