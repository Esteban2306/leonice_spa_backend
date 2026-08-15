import { Injectable } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

@Injectable()
export class clientsHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getReservationHistory(clientId: string) {
    const [reservations, consentRecords] = await Promise.all([
      this.prisma.client.reservation.findMany({
        where: { clientId },
        orderBy: { scheduledStart: 'desc' },
        take: 20,
        include: {
          treatment: true,
          category: true,
        },
      }),

      this.prisma.client.consentRecord.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { reservations, consentRecords };
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
