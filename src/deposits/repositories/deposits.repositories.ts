import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateDepositData } from '../types/deposits.types';
import {
  DepositCoverage,
  DepositStatus,
  DepositVerificationMethod,
  Prisma,
  PrismaClient,
} from '@prisma/client';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class DepositsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateDepositData) {
    return this.prisma.client.depositRecord.create({ data });
  }

  findLatestByReservationId(
    reservationId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.depositRecord.findFirst({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAllByReservationId(reservationId: string) {
    return this.prisma.client.depositRecord.findMany({
      where: {
        reservationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        reservationId: true,
        method: true,
        status: true,
        coverage: true,
        imageUrl: true,
        verifiedByUserId: true,
        verifiedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        amount: true,
        appliedToReservationId: true,
      },
    });
  }

  async findMany(
    filters: {
      status?: DepositStatus;
      method?: DepositVerificationMethod;
      reservationId?: string;
      clientId?: string;
    },
    pagination?: {
      page: number;
      pageSize: number;
    },
  ) {
    const where = {
      ...(filters.status
        ? {
            status: filters.status,
          }
        : {}),

      ...(filters.method
        ? {
            method: filters.method,
          }
        : {}),

      ...(filters.reservationId
        ? {
            reservationId: filters.reservationId,
          }
        : {}),

      ...(filters.clientId
        ? {
            reservation: {
              clientId: filters.clientId,
            },
          }
        : {}),
    };

    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 20;

    const skip = (page - 1) * pageSize;

    const [deposits, total] = await this.prisma.client.$transaction([
      this.prisma.client.depositRecord.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
        include: {
          reservation: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },

              treatment: {
                select: {
                  id: true,
                  name: true,
                },
              },

              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.client.depositRecord.count({
        where,
      }),
    ]);

    return {
      data: deposits,

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  createConfirmedWithoutProof(
    reservationId: string,
    adminUserId: string,
    coverage: DepositCoverage,
    amount: number,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.depositRecord.create({
      data: {
        reservationId,
        method: DepositVerificationMethod.MANUAL,
        status: DepositStatus.CONFIRMADO,
        coverage,
        amount,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
      },
    });
  }

  markConfirmed(
    id: string,
    adminUserId: string,
    coverage: DepositCoverage,
    amount: number,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.depositRecord.update({
      where: { id },
      data: {
        status: DepositStatus.CONFIRMADO,
        coverage,
        amount,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
      },
    });
  }

  /** Confirma solo si sigue PENDIENTE (compare-and-set): evita aprobar algo ya rechazado o aprobado. */
  async markConfirmedIfPending(
    id: string,
    adminUserId: string,
    coverage: DepositCoverage,
    amount: number,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const result = await client.depositRecord.updateMany({
      where: { id, status: DepositStatus.PENDIENTE },
      data: {
        status: DepositStatus.CONFIRMADO,
        coverage,
        amount,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
      },
    });
    return result.count === 1;
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
