import { Injectable } from '@nestjs/common';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  CampaignRecipientStatus,
} from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  DEFAULT_MARKETING_COOLDOWN_DAYS,
  blockedUntil,
} from './marketing-frequency';

const DAY_MS = 86_400_000;
const SETTINGS_ID = 'default';

@Injectable()
export class MarketingFrequencyService {
  constructor(private readonly prisma: PrismaService) {}

  async cooldownDays(): Promise<number> {
    const row = await this.prisma.client.campaignSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { marketingCooldownDays: true },
    });
    return row?.marketingCooldownDays ?? DEFAULT_MARKETING_COOLDOWN_DAYS;
  }

  async recentlyContactedIds(now: Date): Promise<string[]> {
    const days = await this.cooldownDays();
    if (days <= 0) return [];
    const since = new Date(now.getTime() - days * DAY_MS);
    const [campaigns, followUps] = await Promise.all([
      this.prisma.client.campaignRecipient.findMany({
        where: {
          status: CampaignRecipientStatus.SENT,
          sentAt: { gte: since },
        },
        select: { clientId: true },
        distinct: ['clientId'],
      }),
      this.prisma.client.automationExecution.findMany({
        where: {
          type: AutomationExecutionType.REACTIVATION,
          result: AutomationExecutionResult.EXECUTED,
          executedAt: { gte: since },
          clientId: { not: null },
        },
        select: { clientId: true },
        distinct: ['clientId'],
      }),
    ]);
    return [
      ...new Set(
        [...campaigns, ...followUps]
          .map((row) => row.clientId)
          .filter((id): id is string => id !== null),
      ),
    ];
  }

  async blockedUntil(clientId: string, now: Date): Promise<Date | null> {
    const days = await this.cooldownDays();
    if (days <= 0) return null;
    const [campaign, followUp] = await Promise.all([
      this.prisma.client.campaignRecipient.findFirst({
        where: { clientId, status: CampaignRecipientStatus.SENT },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
      this.prisma.client.automationExecution.findFirst({
        where: {
          clientId,
          type: AutomationExecutionType.REACTIVATION,
          result: AutomationExecutionResult.EXECUTED,
        },
        orderBy: { executedAt: 'desc' },
        select: { executedAt: true },
      }),
    ]);
    const times = [campaign?.sentAt, followUp?.executedAt].filter(
      (value): value is Date => value instanceof Date,
    );
    const last = times.length
      ? new Date(Math.max(...times.map((value) => value.getTime())))
      : null;
    return blockedUntil(last, days, now);
  }
}
