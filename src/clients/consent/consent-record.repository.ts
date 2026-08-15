import { Injectable } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

@Injectable()
export class ConsentRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clientId: string,
    type: ConsentType,
    policyVersion: string,
    ipAddress?: string,
  ) {
    return this.prisma.client.consentRecord.create({
      data: {
        clientId,
        type,
        policyVersion,
        consentedAt: new Date(),
        ipAddress,
      },
    });
  }

  async findLatestByType(clientId: string, type: ConsentType) {
    return this.prisma.client.consentRecord.findFirst({
      where: { clientId, type },
      orderBy: { consentedAt: 'desc' },
    });
  }

  async hasAnyOfType(clientId: string, type: ConsentType): Promise<boolean> {
    const consent = await this.findLatestByType(clientId, type);
    return consent !== null;
  }
}
