import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class ConduitOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(eventType: string, payload: unknown) {
    return this.prisma.client.conduitOutboxEvent.create({
      data: { eventType, payload: payload as Prisma.InputJsonValue },
    });
  }

  findById(id: string) {
    return this.prisma.client.conduitOutboxEvent.findUnique({ where: { id } });
  }

  markSent(id: string) {
    return this.prisma.client.conduitOutboxEvent.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  markFailed(id: string, error: string) {
    return this.prisma.client.conduitOutboxEvent.update({
      where: { id },
      data: { status: 'FAILED', lastError: error, attempts: { increment: 1 } },
    });
  }

  findMany(filters: {
    status?: 'PENDING' | 'SENT' | 'FAILED';
    page: number;
    pageSize: number;
  }) {
    const where = filters.status ? { status: filters.status } : {};
    return Promise.all([
      this.prisma.client.conduitOutboxEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.client.conduitOutboxEvent.count({ where }),
    ]);
  }

  resetToPending(id: string) {
    return this.prisma.client.conduitOutboxEvent.update({
      where: { id },
      data: { status: 'PENDING', lastError: null },
    });
  }
}
