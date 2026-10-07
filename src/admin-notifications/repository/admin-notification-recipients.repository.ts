import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

@Injectable()
export class AdminNotificationRecipientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.adminNotificationRecipient.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findActive() {
    return this.prisma.client.adminNotificationRecipient.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.client.adminNotificationRecipient.findUnique({
      where: { id },
    });
  }

  create(data: { name: string; phone: string }) {
    return this.prisma.client.adminNotificationRecipient.create({ data });
  }

  update(id: string, data: { name?: string; isActive?: boolean }) {
    return this.prisma.client.adminNotificationRecipient.update({
      where: { id },
      data,
    });
  }
}
