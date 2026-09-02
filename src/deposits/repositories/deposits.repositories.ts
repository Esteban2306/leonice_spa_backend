import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateDepositData } from '../types/deposits.types';
import {
  DepositCoverage,
  DepositStatus,
  DepositVerificationMethod,
} from '@prisma/client';

@Injectable()
export class DepositsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateDepositData) {
    return this.prisma.client.depositRecord.create({ data });
  }

  findLatestByReservationId(reservationId: string) {
    return this.prisma.client.depositRecord.findFirst({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAllByReservationId(reservationId: string) {
    return this.prisma.client.depositRecord.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMany(filters: {
    status?: DepositStatus;
    method?: DepositVerificationMethod;
    reservationId?: string;
    clientId?: string;
  }) {
    return this.prisma.client.depositRecord.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.method ? { method: filters.method } : {}),
        ...(filters.reservationId
          ? { reservationId: filters.reservationId }
          : {}),
        ...(filters.clientId
          ? { reservation: { clientId: filters.clientId } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        reservation: {
          include: {
            client: { select: { id: true, name: true, phone: true } },
            treatment: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async markExpiredBySystem(reservationId: string) {
    const deposit = await this.prisma.client.depositRecord.findFirst({
      where: { reservationId, status: DepositStatus.PENDIENTE },
      orderBy: { createdAt: 'desc' },
    });
    if (!deposit) return;

    return this.prisma.client.depositRecord.update({
      where: { id: deposit.id },
      data: {
        status: DepositStatus.RECHAZADO,
        rejectionReason:
          'Reserva cancelada automáticamente por tiempo de espera',
        verifiedAt: new Date(),
      },
    });
  }

  markConfirmed(id: string, adminUserId: string, coverage: DepositCoverage) {
    return this.prisma.client.depositRecord.update({
      where: { id },
      data: {
        status: DepositStatus.CONFIRMADO,
        coverage,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
      },
    });
  }

  markRejected(id: string, adminUserId: string, reason: string) {
    return this.prisma.client.depositRecord.update({
      where: { id },
      data: {
        status: DepositStatus.RECHAZADO,
        rejectionReason: reason,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
      },
    });
  }
}
