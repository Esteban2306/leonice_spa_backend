import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CampaignRecipientStatus,
  Promotion,
  CampaignStatus,
  ConsentType,
  ReservationStatus,
} from '@prisma/client';
import { ANONYMIZED_PHONE_PREFIX } from '../client-privacy/anonymized-client';
import { ConduitApiClient } from '../conduit/client/conduit-api.client';
import { BROADCAST_TEMPLATES } from '../conduit/templates/conduit-template-catalog';
import { ConduitTemplateResolver } from '../conduit/templates/conduit-template-resolver';
import { ConduitSystemPauseService } from '../conduit/pause/conduit-system-pause.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { SafeCacheService } from '../infrastructure/redis/safe-cache.service';
import { cooldownReason } from '../marketing/marketing-frequency';
import { MarketingFrequencyService } from '../marketing/marketing-frequency.service';
import { CampaignsService } from './campaigns.service';
import {
  buildCampaignVariables,
  templateNeedsPromotion,
} from './domain/campaign-variables';
import {
  bogotaMinuteOfDay,
  normalizeWindows,
  PACE_PROFILES,
  PaceProfile,
} from './domain/pacing';

const TICK_EVERY_MS = 15_000;
const LOCK_KEY = 'lock:campaign-tick';
const LOCK_TTL_SECONDS = 25;
const HOUR_MS = 3_600_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;
const BREAKER_STREAK = 3;

@Injectable()
export class CampaignRunnerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CampaignRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly conduit: ConduitApiClient,
    private readonly templates: ConduitTemplateResolver,
    private readonly cache: SafeCacheService,
    private readonly frequency: MarketingFrequencyService,
    private readonly systemPause: ConduitSystemPauseService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), TICK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const acquired = await this.cache.setIfAbsent(
        LOCK_KEY,
        new Date().toISOString(),
        LOCK_TTL_SECONDS,
      );
      if (acquired === false) return;
      await this.tick();
    } catch (error) {
      this.logger.error(
        `Falló el envío de campañas: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.busy = false;
    }
  }

  async tick(now: Date = new Date()): Promise<'idle' | 'sent' | 'blocked'> {
    if (await this.systemPause.isPaused()) return 'blocked';

    const settings = await this.campaigns.getSettings();
    const minute = bogotaMinuteOfDay(now.getTime());
    const windows = normalizeWindows(settings.sendWindows);
    if (!windows.some((w) => minute >= w.startMinute && minute < w.endMinute)) {
      return 'idle';
    }

    const due = await this.prisma.client.campaignRecipient.findFirst({
      where: {
        status: CampaignRecipientStatus.PENDING,
        scheduledAt: { lte: now },
        campaign: { status: CampaignStatus.RUNNING },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { campaign: true },
    });
    if (!due) return 'idle';

    const pace = PACE_PROFILES[due.campaign.pace as PaceProfile];
    const [sentToday, sentLastHour, lastSent] = await Promise.all([
      this.campaigns.sentToday(now),
      this.prisma.client.campaignRecipient.count({
        where: {
          status: CampaignRecipientStatus.SENT,
          sentAt: { gte: new Date(now.getTime() - HOUR_MS) },
        },
      }),
      this.prisma.client.campaignRecipient.findFirst({
        where: { status: CampaignRecipientStatus.SENT },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
    ]);
    const tooSoon =
      lastSent?.sentAt &&
      now.getTime() - lastSent.sentAt.getTime() < pace.gapSeconds[0] * 1000;
    if (sentToday >= settings.maxPerDay || sentLastHour >= pace.hourlyCap) {
      return 'blocked';
    }
    if (tooSoon) return 'blocked';

    await this.deliver(due, now);
    return 'sent';
  }

  private async deliver(
    recipient: {
      id: string;
      clientId: string;
      attempts: number;
      campaign: {
        id: string;
        templateCode: string;
        promotionId: string | null;
        marketing: boolean;
      };
    },
    now: Date,
  ): Promise<void> {
    const { campaign } = recipient;
    const template = BROADCAST_TEMPLATES.find(
      (item) => item.code === campaign.templateCode,
    );
    if (!template) {
      await this.campaigns.pause(
        campaign.id,
        'La plantilla de esta campaña ya no existe',
      );
      return;
    }

    const templateId = await this.templates.resolve(template.envKey);
    if (!templateId) {
      await this.campaigns.pause(
        campaign.id,
        'La plantilla no está creada en Conduit',
      );
      return;
    }

    let promotion: Promotion | null = null;
    if (templateNeedsPromotion(template)) {
      promotion = campaign.promotionId
        ? await this.prisma.client.promotion.findUnique({
            where: { id: campaign.promotionId },
          })
        : null;
      if (!promotion || !promotion.isActive || promotion.endsAt <= now) {
        await this.campaigns.pause(
          campaign.id,
          'La promoción terminó o fue desactivada',
        );
        return;
      }
    }

    const client = await this.prisma.client.client.findUnique({
      where: { id: recipient.clientId },
      select: {
        name: true,
        phone: true,
        whatsappJid: true,
        consentRecords: {
          where: { type: ConsentType.MARKETING },
          select: { id: true },
          take: 1,
        },
        reservations: {
          where: { status: ReservationStatus.COMPLETADA },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
      },
    });

    const skipReason = this.skipReason(client, campaign.marketing);
    if (skipReason || !client) {
      await this.finish(recipient.id, CampaignRecipientStatus.SKIPPED, {
        errorMessage: skipReason ?? 'La clienta ya no existe',
      });
      await this.closeIfDone(campaign.id, now);
      return;
    }

    if (campaign.marketing) {
      const until = await this.frequency.blockedUntil(recipient.clientId, now);
      if (until) {
        await this.finish(recipient.id, CampaignRecipientStatus.SKIPPED, {
          errorMessage: cooldownReason(until),
        });
        await this.closeIfDone(campaign.id, now);
        return;
      }
    }

    const built = buildCampaignVariables(
      template,
      {
        name: client.name,
        lastVisitAt: client.reservations[0]?.completedAt ?? null,
      },
      promotion,
      now,
    );
    if ('skip' in built) {
      await this.finish(recipient.id, CampaignRecipientStatus.SKIPPED, {
        errorMessage: built.skip,
      });
      await this.closeIfDone(campaign.id, now);
      return;
    }

    let outcome: { delivered: boolean; permanent?: boolean; reason?: string };
    try {
      outcome = await this.conduit.sendWhatsappMessage({
        phone: client.phone,
        templateId,
        variables: built.variables,
        idempotencyKey: `campaign:${campaign.id}:${recipient.clientId}`,
        companyEventId: `campaign:${campaign.id}`,
      });
    } catch (error) {
      outcome = {
        delivered: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (outcome.delivered) {
      await this.finish(recipient.id, CampaignRecipientStatus.SENT, {
        sentAt: now,
        attempts: recipient.attempts + 1,
      });
    } else if (outcome.permanent || recipient.attempts + 1 >= MAX_ATTEMPTS) {
      await this.finish(recipient.id, CampaignRecipientStatus.FAILED, {
        errorMessage: outcome.reason ?? 'No se pudo enviar',
        attempts: recipient.attempts + 1,
      });
      await this.pauseIfStreak(campaign.id);
    } else {
      await this.prisma.client.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          attempts: recipient.attempts + 1,
          errorMessage: outcome.reason ?? null,
          scheduledAt: new Date(now.getTime() + RETRY_DELAY_MS),
        },
      });
    }
    await this.closeIfDone(campaign.id, now);
  }

  private skipReason(
    client: {
      phone: string;
      whatsappJid: string | null;
      consentRecords: Array<{ id: string }>;
    } | null,
    marketing: boolean,
  ): string | null {
    if (!client) return 'La clienta ya no existe';
    if (client.phone.startsWith(ANONYMIZED_PHONE_PREFIX)) {
      return 'La clienta fue anonimizada';
    }
    if (!client.whatsappJid) return 'Sin WhatsApp verificado';
    if (marketing && client.consentRecords.length === 0) {
      return 'Sin consentimiento de marketing';
    }
    return null;
  }

  private finish(
    id: string,
    status: CampaignRecipientStatus,
    data: { sentAt?: Date; errorMessage?: string; attempts?: number },
  ) {
    return this.prisma.client.campaignRecipient.update({
      where: { id },
      data: { status, ...data },
    });
  }

  private async pauseIfStreak(campaignId: string): Promise<void> {
    const last = await this.prisma.client.campaignRecipient.findMany({
      where: {
        campaignId,
        status: {
          in: [CampaignRecipientStatus.SENT, CampaignRecipientStatus.FAILED],
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: BREAKER_STREAK,
      select: { status: true },
    });
    if (
      last.length === BREAKER_STREAK &&
      last.every((row) => row.status === CampaignRecipientStatus.FAILED)
    ) {
      await this.campaigns.pause(
        campaignId,
        `Se pausó sola: ${BREAKER_STREAK} envíos seguidos fallaron. Revisa la conexión de WhatsApp antes de reanudar.`,
      );
    }
  }

  private async closeIfDone(campaignId: string, now: Date): Promise<void> {
    const pending = await this.prisma.client.campaignRecipient.count({
      where: { campaignId, status: CampaignRecipientStatus.PENDING },
    });
    if (pending > 0) return;
    await this.prisma.client.campaign.updateMany({
      where: { id: campaignId, status: CampaignStatus.RUNNING },
      data: { status: CampaignStatus.COMPLETED, finishedAt: now },
    });
  }
}
