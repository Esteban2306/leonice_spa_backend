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
import {
  HOLDING_EXCLUDED_STATUSES,
  UNATTENDED_STATUSES,
  UNRESOLVED_DEPOSIT_STATUSES,
} from '../domain/reservation-status.constants';
import {
  APPOINTMENT_SELECT,
  GROUPED_APPOINTMENT_SELECT,
  LATEST_DEPOSIT_ORDER,
  RESERVATION_DETAIL_SELECT,
  RESERVATION_OWNER_SELECT,
  SCHEDULE_ORDER,
} from './reservation.selects';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

interface UpdateStatusData {
  status: ReservationStatus;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  cancellationSource?: CancellationSource | null;
  checkedInAt?: Date;
  completedAt?: Date;
  depositExpiresAt?: Date | null;
  depositClockStartedAt?: Date | null;
  noShowFromStatus?: ReservationStatus | null;
}

export interface ReservationFilters {
  dayStart?: Date;
  dayEnd?: Date;
  status?: ReservationStatus;
  cancellationSources?: readonly CancellationSource[];
  categoryId?: string;
  clientId?: string;
  unresolvedDepositOnly?: boolean;
}

export interface ReservationPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class ReservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, client: PrismaClientOrTx = this.prisma.client) {
    return client.reservation.findUnique({ where: { id } });
  }

  findByComboGroupId(
    comboGroupId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: { comboGroupId },
      orderBy: SCHEDULE_ORDER,
    });
  }

  findByIdWithDetails(id: string) {
    return this.prisma.client.reservation.findUnique({
      where: { id },
      select: RESERVATION_DETAIL_SELECT,
    });
  }

  findByClientAndDayWithStatus(
    clientId: string,
    dayStart: Date,
    dayEnd: Date,
    status: ReservationStatus,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        clientId,
        status,
        scheduledStart: { gte: dayStart, lt: dayEnd },
      },
      orderBy: SCHEDULE_ORDER,
    });
  }

  findGroupingProjection(filters: ReservationFilters) {
    return this.prisma.client.reservation.findMany({
      where: this.buildWhere(filters),
      orderBy: SCHEDULE_ORDER,
      select: {
        id: true,
        clientId: true,
        status: true,
        scheduledStart: true,
        deposit: {
          orderBy: LATEST_DEPOSIT_ORDER,
          take: 1,
          select: { status: true },
        },
      },
    });
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

  findManyByIdsWithDetails(ids: string[]) {
    return this.prisma.client.reservation.findMany({
      where: { id: { in: ids } },
      orderBy: SCHEDULE_ORDER,
      select: GROUPED_APPOINTMENT_SELECT,
    });
  }

  findManyForCalendar(dayStart: Date, dayEnd: Date) {
    return this.prisma.client.reservation.findMany({
      where: { scheduledStart: { gte: dayStart, lt: dayEnd } },
      orderBy: SCHEDULE_ORDER,
      select: APPOINTMENT_SELECT,
    });
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

  async updateStatusIfCurrentUnlessProofPending(
    id: string,
    expectedStatus: ReservationStatus,
    data: UpdateStatusData,
  ): Promise<'APPLIED' | 'STALE' | 'PROOF_PENDING'> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id} FOR UPDATE`;
      if (await this.hasSubmittedProof(id, tx)) return 'PROOF_PENDING';
      const applied = await this.updateStatusIfCurrent(
        id,
        expectedStatus,
        data,
        tx,
      );
      return applied ? 'APPLIED' : 'STALE';
    });
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

  findUpcomingForClientPhone(
    params: {
      phone: string;
      from: Date;
      statuses: readonly ReservationStatus[];
    },
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        client: { phone: params.phone },
        status: { in: [...params.statuses] },
        scheduledStart: { gt: params.from },
      },
      orderBy: SCHEDULE_ORDER,
      take: 50,
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        comboGroupId: true,
        dependent: { select: { name: true } },
        treatment: { select: { name: true } },
      },
    });
  }

  findClientReservationsOnDay(
    params: { clientId: string; dayStart: Date; dayEnd: Date },
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        clientId: params.clientId,
        scheduledStart: { gte: params.dayStart, lt: params.dayEnd },
      },
      orderBy: SCHEDULE_ORDER,
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        cancellationSource: true,
        treatment: { select: { name: true } },
      },
    });
  }

  countInProgressStartedBefore(
    startedBefore: Date,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<number> {
    return client.reservation.count({
      where: {
        status: ReservationStatus.CITA_EN_CURSO,
        scheduledStart: { lt: startedBefore },
      },
    });
  }

  findInProgressStartedBefore(
    startedBefore: Date,
    limit: number,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        status: ReservationStatus.CITA_EN_CURSO,
        scheduledStart: { lt: startedBefore },
      },
      select: {
        id: true,
        scheduledStart: true,
        client: { select: { name: true } },
        treatment: { select: { name: true } },
      },
      orderBy: { scheduledStart: 'asc' },
      take: limit,
    });
  }

  async findOverdueUnattendedIds(
    startedBefore: Date,
    limit: number,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<string[]> {
    const rows = await client.reservation.findMany({
      where: {
        status: { in: [...UNATTENDED_STATUSES] },
        checkedInAt: null,
        scheduledStart: { lt: startedBefore },
      },
      select: { id: true },
      orderBy: { scheduledStart: 'asc' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  async setCoveredByDeposit(
    reservationIds: readonly string[],
    depositId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<void> {
    if (reservationIds.length === 0) return;
    await client.reservation.updateMany({
      where: { id: { in: [...reservationIds] } },
      data: { coveredByDepositId: depositId },
    });
  }

  async restartDepositDeadlineIfAwaiting(
    id: string,
    deadline: { depositClockStartedAt: Date; depositExpiresAt: Date },
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const result = await client.reservation.updateMany({
      where: { id, status: ReservationStatus.PENDIENTE_DEPOSITO },
      data: deadline,
    });
    return result.count === 1;
  }

  findDepositDeadlinesRunningDuring(
    params: { from: Date; until: Date },
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findMany({
      where: {
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        depositClockStartedAt: { not: null, lt: params.until },
        depositExpiresAt: { not: null, gt: params.from },
      },
      select: {
        id: true,
        scheduledStart: true,
        depositClockStartedAt: true,
        depositExpiresAt: true,
      },
    });
  }

  async extendDepositDeadlineIfUnchanged(
    id: string,
    previous: Date,
    next: Date,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const result = await client.reservation.updateMany({
      where: {
        id,
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        depositExpiresAt: previous,
      },
      data: { depositExpiresAt: next },
    });
    return result.count === 1;
  }

  findByIdWithClientPhone(
    id: string,
    client: PrismaClientOrTx = this.prisma.client,
  ) {
    return client.reservation.findUnique({
      where: { id },
      select: RESERVATION_OWNER_SELECT,
    });
  }

  async findActiveStartsForPersonTreatment(
    params: {
      clientId: string;
      dependentId: string | null;
      treatmentId: string;
      dayStart: Date;
      dayEnd: Date;
      excludeReservationId?: string;
    },
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<Date[]> {
    const rows = await client.reservation.findMany({
      where: {
        clientId: params.clientId,
        dependentId: params.dependentId,
        treatmentId: params.treatmentId,
        status: { notIn: HOLDING_EXCLUDED_STATUSES },
        scheduledStart: { gte: params.dayStart, lt: params.dayEnd },
        ...(params.excludeReservationId
          ? { id: { not: params.excludeReservationId } }
          : {}),
      },
      select: { scheduledStart: true },
    });
    return rows.map((r) => r.scheduledStart);
  }

  async getDashboardSummary(dayStart: Date, dayEnd: Date) {
    const [
      completedReservations,
      pendingReservations,
      dailyEarnings,
      todayAppointments,
    ] = await this.prisma.client.$transaction([
      this.prisma.client.reservation.count({
        where: {
          scheduledStart: {
            gte: dayStart,
            lt: dayEnd,
          },
          status: ReservationStatus.COMPLETADA,
        },
      }),

      this.prisma.client.reservation.count({
        where: {
          status: ReservationStatus.PENDIENTE_DEPOSITO,
        },
      }),

      this.prisma.client.reservation.aggregate({
        where: {
          scheduledStart: {
            gte: dayStart,
            lt: dayEnd,
          },
          status: ReservationStatus.COMPLETADA,
        },
        _sum: {
          finalPrice: true,
        },
      }),

      this.prisma.client.reservation.count({
        where: {
          scheduledStart: {
            gte: dayStart,
            lt: dayEnd,
          },
          status: {
            in: [
              ReservationStatus.PENDIENTE_DEPOSITO,
              ReservationStatus.CONFIRMADA,
              ReservationStatus.CITA_EN_CURSO,
              ReservationStatus.COMPLETADA,
            ],
          },
        },
      }),
    ]);

    return {
      completedReservations,
      pendingReservations,
      dailyEarnings: dailyEarnings._sum.finalPrice ?? 0,
      todayAppointments,
    };
  }

  async hasMoreRecentActivity(
    clientId: string,
    since: Date,
    exclude: { reservationId: string; comboGroupId: string | null },
  ): Promise<boolean> {
    const count = await this.prisma.client.reservation.count({
      where: {
        clientId,
        id: { not: exclude.reservationId },
        status: { notIn: HOLDING_EXCLUDED_STATUSES },
        OR: [{ scheduledStart: { gt: since } }, { completedAt: { gt: since } }],
        ...(exclude.comboGroupId
          ? {
              NOT: { comboGroupId: exclude.comboGroupId },
            }
          : {}),
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

  async updateValoracionIfCurrent(
    id: string,
    expectedStatus: ReservationStatus,
    data: {
      finalPrice: number;
      finalDurationMinutes: number;
      scheduledEnd: Date;
      status: ReservationStatus;
      depositClockStartedAt: Date;
      depositExpiresAt: Date;
    },
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<boolean> {
    const result = await client.reservation.updateMany({
      where: { id, status: expectedStatus },
      data: { ...data, valoracionRespondedAt: new Date() },
    });
    return result.count === 1;
  }

  private buildWhere(
    filters: ReservationFilters,
  ): Prisma.ReservationWhereInput {
    const scheduledStart: Prisma.DateTimeFilter = {
      ...(filters.dayStart ? { gte: filters.dayStart } : {}),
      ...(filters.dayEnd ? { lt: filters.dayEnd } : {}),
    };
    return {
      ...(filters.dayStart || filters.dayEnd ? { scheduledStart } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.cancellationSources?.length
        ? { cancellationSource: { in: [...filters.cancellationSources] } }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.unresolvedDepositOnly
        ? {
            AND: [
              { status: { in: [...UNRESOLVED_DEPOSIT_STATUSES] } },
              { deposit: { some: { status: DepositStatus.CONFIRMADO } } },
            ],
          }
        : {}),
    };
  }
}
