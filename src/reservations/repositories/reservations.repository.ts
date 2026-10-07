import { Injectable } from '@nestjs/common';
import {
  CancellationSource,
  DepositStatus,
  Prisma,
  PrismaClient,
  Reservation,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { HOLDING_EXCLUDED_STATUSES } from '../domain/reservation-status.constants';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

interface UpdateStatusData {
  status: ReservationStatus;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  cancellationSource?: CancellationSource | null;
  checkedInAt?: Date;
  completedAt?: Date;
  depositExpiresAt?: Date | null;
}

@Injectable()
export class ReservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, client: PrismaClientOrTx = this.prisma.client) {
    return client.reservation.findUnique({ where: { id } });
  }

  async hasSubmittedProof(
    reservationId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const count = await client.depositRecord.count({
      where: {
        reservationId,
        status: DepositStatus.PENDIENTE,
        imageUrl: { not: null },
      },
    });
    return count > 0;
  }

  async updateStatusIfCurrent(
    id: string,
    expectedStatus: ReservationStatus,
    data: UpdateStatusData,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const result = await client.reservation.updateMany({
      where: { id, status: expectedStatus },
      data,
    });
    return result.count === 1;
  }

  async updateScheduleIfCurrent(
    id: string,
    expected: { status: ReservationStatus; scheduledStart: Date },
    data: { scheduledStart: Date; scheduledEnd: Date },
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const result = await client.reservation.updateMany({
      where: {
        id,
        status: expected.status,
        scheduledStart: expected.scheduledStart,
      },
      data,
    });
    return result.count === 1;
  }

  async findExpiredPendingDepositIds(
    now: Date,
    limit: number,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<string[]> {
    const rows = await client.reservation.findMany({
      where: {
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        depositExpiresAt: { lt: now },
        deposit: {
          none: { status: DepositStatus.PENDIENTE, imageUrl: { not: null } },
        },
      },
      select: { id: true },
      orderBy: { depositExpiresAt: 'asc' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  extendDepositDeadline(
    id: string,
    depositExpiresAt: Date,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<Reservation> {
    return client.reservation.update({
      where: { id },
      data: { depositExpiresAt },
    });
  }

  async findByIdWithClientPhone(
    id: string,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findUnique({
      where: { id },
      include: { client: { select: { phone: true, name: true } } },
    });
  }

  async findActiveIntervalsForClientOnDay(
    clientId: string,
    dayStart: Date,
    dayEnd: Date,
    client: PrismaClientOrTx = this.prisma.client,
    excludeReservationId?: string,
  ): Promise<{ start: Date; end: Date }[]> {
    const rows = await client.reservation.findMany({
      where: {
        clientId,
        status: { notIn: HOLDING_EXCLUDED_STATUSES },
        scheduledStart: { lt: dayEnd },
        scheduledEnd: { gt: dayStart },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { scheduledStart: true, scheduledEnd: true },
    });
    return rows.map((r) => ({ start: r.scheduledStart, end: r.scheduledEnd }));
  }

  async findMany(filters: {
    dayStart?: Date;
    dayEnd?: Date;
    status?: ReservationStatus;
    categoryId?: string;
    clientId?: string;
  }) {
    return this.prisma.client.reservation.findMany({
      where: {
        ...(filters.dayStart && filters.dayEnd
          ? { scheduledStart: { gte: filters.dayStart, lt: filters.dayEnd } }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
      },
      orderBy: { scheduledStart: 'asc' },
      take: 200,
      include: {
        client: { select: { id: true, name: true, phone: true } },
        treatment: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        deposit: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  async hasActiveReservationInCategoryOnDay(
    clientId: string,
    categoryId: string,
    dayStart: Date,
    dayEnd: Date,
    excludeReservationId?: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const count = await client.reservation.count({
      where: {
        clientId,
        categoryId,
        status: { notIn: HOLDING_EXCLUDED_STATUSES },
        scheduledStart: { gte: dayStart, lt: dayEnd },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
    });
    return count > 0;
  }

  async hasMoreRecentActivityInCategory(
    clientId: string,
    categoryId: string,
    since: Date,
  ): Promise<boolean> {
    const count = await this.prisma.client.reservation.count({
      where: {
        clientId,
        categoryId,
        status: { notIn: HOLDING_EXCLUDED_STATUSES },
        OR: [{ scheduledStart: { gt: since } }, { completedAt: { gt: since } }],
      },
    });
    return count > 0;
  }

  updateStatus(
    id: string,
    data: UpdateStatusData,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<Reservation> {
    return client.reservation.update({ where: { id }, data });
  }

  updateSchedule(
    id: string,
    data: { scheduledStart: Date; scheduledEnd: Date },
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.update({ where: { id }, data });
  }

  updateValoracion(
    id: string,
    data: {
      finalPrice: number;
      finalDurationMinutes: number;
      scheduledEnd: Date;
      status: ReservationStatus;
      depositExpiresAt: Date;
    },
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<Reservation> {
    return client.reservation.update({
      where: { id },
      data: { ...data, valoracionRespondedAt: new Date() },
    });
  }
}
