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
}
