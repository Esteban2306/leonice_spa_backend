import { Injectable } from '@nestjs/common';
import { ConduitMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ConduitMessageEventDto } from '../dto/conduit-message-event.dto';

@Injectable()
export class ConduitMessageDeliveryLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(dto: ConduitMessageEventDto): Promise<boolean> {
    try {
      await this.prisma.client.conduitMessageDeliveryLog.create({
        data: {
          messageId: dto.data.messageId,
          status: dto.data.status,
          channel: dto.data.channel,
          recipient: dto.data.recipient,
          provider: dto.data.provider,
          providerMessageId: dto.data.providerMessageId,
          errorMessage: dto.data.error ?? undefined,
          companyEventId: dto.data.meta?.companyEventId,
          rawPayload: dto as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  findAll(filters: {
    messageId?: string;
    companyEventId?: string;
    status?: ConduitMessageStatus;
  }) {
    return this.prisma.client.conduitMessageDeliveryLog.findMany({
      where: {
        ...(filters.messageId ? { messageId: filters.messageId } : {}),
        ...(filters.companyEventId
          ? { companyEventId: filters.companyEventId }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
  }
}
