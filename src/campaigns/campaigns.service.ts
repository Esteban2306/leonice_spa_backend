import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  Prisma,
} from '@prisma/client';
import { AudiencesService } from '../audiences/audiences.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  BROADCAST_TEMPLATES,
  ConduitTemplateDefinition,
} from '../conduit/templates/conduit-template-catalog';
import { ConduitTemplateResolver } from '../conduit/templates/conduit-template-resolver';
import {
  templateNeedsPromotion,
  templateNeedsVisit,
} from './domain/campaign-variables';
import {
  bogotaDayStart,
  DEFAULT_MAX_PER_DAY,
  DEFAULT_SEND_WINDOWS,
  estimateSchedule,
  normalizeWindows,
  PaceProfile,
  planSchedule,
  SendWindow,
} from './domain/pacing';
import {
  CreateCampaignDto,
  EstimateCampaignDto,
  ListCampaignRecipientsQueryDto,
  UpdateCampaignSettingsDto,
} from './dto/campaign.dto';

export interface CampaignSettingsView {
  sendWindows: SendWindow[];
  maxPerDay: number;
}

export interface BroadcastTemplateView {
  code: string;
  name: string;
  description: string;
  configured: boolean;
  needsPromotion: boolean;
  needsVisit: boolean;
  body: string;
}

const SETTINGS_ID = 'default';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudiencesService,
    private readonly templates: ConduitTemplateResolver,
  ) {}

  async getSettings(): Promise<CampaignSettingsView> {
    const row = await this.prisma.client.campaignSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    return {
      sendWindows: normalizeWindows(
        (row?.sendWindows as unknown as SendWindow[] | undefined) ??
          DEFAULT_SEND_WINDOWS,
      ),
      maxPerDay: row?.maxPerDay ?? DEFAULT_MAX_PER_DAY,
    };
  }

  async updateSettings(
    dto: UpdateCampaignSettingsDto,
  ): Promise<CampaignSettingsView> {
    const sendWindows = normalizeWindows(dto.sendWindows);
    await this.prisma.client.campaignSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        sendWindows: sendWindows as unknown as Prisma.InputJsonValue,
        maxPerDay: dto.maxPerDay,
      },
      update: {
        sendWindows: sendWindows as unknown as Prisma.InputJsonValue,
        maxPerDay: dto.maxPerDay,
      },
    });
    return { sendWindows, maxPerDay: dto.maxPerDay };
  }

  async listTemplates(): Promise<BroadcastTemplateView[]> {
    const usage = await this.templates.describe();
    return BROADCAST_TEMPLATES.map((template) => ({
      code: template.code,
      name: template.name,
      description: template.description,
      configured:
        usage.find((item) => item.name === template.code)?.configured ?? false,
      needsPromotion: templateNeedsPromotion(template),
      needsVisit: templateNeedsVisit(template),
      body: template.body,
    }));
  }

  async estimate(dto: EstimateCampaignDto, now: Date = new Date()) {
    const template = this.requireTemplate(dto.templateCode);
    await this.requirePromotionIfNeeded(template, dto.promotionId, now);
    const [settings, preview, alreadySentToday] = await Promise.all([
      this.getSettings(),
      this.audiences.preview(dto.filter, template.marketing === true, now),
      this.sentToday(now),
    ]);
    const schedule = estimateSchedule({
      count: preview.total,
      start: this.startOf(dto.startAt, now),
      pace: dto.pace,
      windows: settings.sendWindows,
      maxPerDay: settings.maxPerDay,
      alreadySentToday,
    });
    return { audience: preview, schedule, settings };
  }

  async create(dto: CreateCampaignDto, now: Date = new Date()) {
    const template = this.requireTemplate(dto.templateCode);
    await this.requirePromotionIfNeeded(template, dto.promotionId, now);

    const usage = (await this.templates.describe()).find(
      (item) => item.name === template.code,
    );
    if (!usage?.configured) {
      throw new ConflictException(
        'La plantilla todavía no está creada en Conduit. Créala antes de lanzar la campaña.',
      );
    }

    const marketing = template.marketing === true;
    const members = await this.audiences.members(dto.filter, marketing, now);
    if (members.length === 0) {
      throw new BadRequestException(
        'No hay clientas que cumplan ese filtro y puedan recibir el mensaje',
      );
    }

    const settings = await this.getSettings();
    const times = planSchedule({
      count: members.length,
      start: this.startOf(dto.startAt, now),
      pace: dto.pace,
      windows: settings.sendWindows,
      maxPerDay: settings.maxPerDay,
      alreadySentToday: await this.sentToday(now),
    });
    const shuffled = shuffle(members);

    const campaign = await this.prisma.client.campaign.create({
      data: {
        name: dto.name.trim(),
        templateCode: template.code,
        promotionId: dto.promotionId ?? null,
        audience: dto.filter as unknown as Prisma.InputJsonValue,
        marketing,
        pace: dto.pace,
        totalRecipients: members.length,
        startsAt: times[0] ?? this.startOf(dto.startAt, now),
        recipients: {
          create: shuffled.map((member, index) => ({
            clientId: member.id,
            scheduledAt: times[index] ?? times[times.length - 1],
          })),
        },
      },
    });
    return this.get(campaign.id);
  }

  async list() {
    const campaigns = await this.prisma.client.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const counts = await this.countsByCampaign(campaigns.map((c) => c.id));
    return campaigns.map((campaign) =>
      this.toView(campaign, counts.get(campaign.id)),
    );
  }

  async get(id: string) {
    const campaign = await this.requireCampaign(id);
    const counts = await this.countsByCampaign([id]);
    return this.toView(campaign, counts.get(id));
  }

  async recipients(id: string, query: ListCampaignRecipientsQueryDto) {
    await this.requireCampaign(id);
    const where: Prisma.CampaignRecipientWhereInput = {
      campaignId: id,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.campaignRecipient.findMany({
        where,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.campaignRecipient.count({ where }),
    ]);
    const clients = await this.prisma.client.client.findMany({
      where: { id: { in: rows.map((row) => row.clientId) } },
      select: { id: true, name: true, phone: true },
    });
    const byId = new Map(clients.map((client) => [client.id, client]));
    return {
      data: rows.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        name: byId.get(row.clientId)?.name ?? 'Clienta eliminada',
        phone: byId.get(row.clientId)?.phone ?? '',
        status: row.status,
        scheduledAt: row.scheduledAt,
        sentAt: row.sentAt,
        errorMessage: row.errorMessage,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async pause(id: string, reason: string | null = null) {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new ConflictException('Solo se puede pausar una campaña en curso');
    }
    await this.prisma.client.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PAUSED, pausedReason: reason },
    });
    return this.get(id);
  }

  async resume(id: string, now: Date = new Date()) {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new ConflictException('Solo se puede reanudar una campaña pausada');
    }
    const [settings, alreadySentToday, pending] = await Promise.all([
      this.getSettings(),
      this.sentToday(now),
      this.prisma.client.campaignRecipient.findMany({
        where: { campaignId: id, status: CampaignRecipientStatus.PENDING },
        orderBy: { scheduledAt: 'asc' },
        select: { id: true },
      }),
    ]);
    const times = planSchedule({
      count: pending.length,
      start: now,
      pace: campaign.pace as PaceProfile,
      windows: settings.sendWindows,
      maxPerDay: settings.maxPerDay,
      alreadySentToday,
    });
    await this.prisma.client.$transaction([
      ...pending.map((row, index) =>
        this.prisma.client.campaignRecipient.update({
          where: { id: row.id },
          data: { scheduledAt: times[index] ?? times[times.length - 1] },
        }),
      ),
      this.prisma.client.campaign.update({
        where: { id },
        data: { status: CampaignStatus.RUNNING, pausedReason: null },
      }),
    ]);
    return this.get(id);
  }

  async cancel(id: string, now: Date = new Date()) {
    const campaign = await this.requireCampaign(id);
    if (
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.CANCELLED
    ) {
      throw new ConflictException('La campaña ya terminó');
    }
    await this.prisma.client.$transaction([
      this.prisma.client.campaignRecipient.updateMany({
        where: { campaignId: id, status: CampaignRecipientStatus.PENDING },
        data: {
          status: CampaignRecipientStatus.SKIPPED,
          errorMessage: 'Campaña cancelada',
        },
      }),
      this.prisma.client.campaign.update({
        where: { id },
        data: { status: CampaignStatus.CANCELLED, finishedAt: now },
      }),
    ]);
    return this.get(id);
  }

  async sentToday(now: Date): Promise<number> {
    return this.prisma.client.campaignRecipient.count({
      where: {
        status: CampaignRecipientStatus.SENT,
        sentAt: { gte: new Date(bogotaDayStart(now.getTime())) },
      },
    });
  }

  private startOf(startAt: string | undefined, now: Date): Date {
    if (!startAt) return now;
    const requested = new Date(startAt);
    return requested > now ? requested : now;
  }

  private requireTemplate(code: string): ConduitTemplateDefinition {
    const template = BROADCAST_TEMPLATES.find((item) => item.code === code);
    if (!template) {
      throw new BadRequestException(
        'Ese mensaje no se puede enviar a un grupo de clientas',
      );
    }
    return template;
  }

  private async requirePromotionIfNeeded(
    template: ConduitTemplateDefinition,
    promotionId: string | undefined,
    now: Date,
  ) {
    if (!templateNeedsPromotion(template)) return;
    if (!promotionId) {
      throw new BadRequestException('Elige la promoción que vas a anunciar');
    }
    const promotion = await this.prisma.client.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promotion || !promotion.isActive || promotion.endsAt <= now) {
      throw new BadRequestException(
        'La promoción no existe o ya no está vigente',
      );
    }
  }

  private async requireCampaign(id: string) {
    const campaign = await this.prisma.client.campaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    return campaign;
  }

  private async countsByCampaign(ids: string[]) {
    const rows = await this.prisma.client.campaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
      _min: { scheduledAt: true },
      _max: { scheduledAt: true },
    });
    const result = new Map<
      string,
      {
        counts: Record<CampaignRecipientStatus, number>;
        next: Date | null;
        last: Date | null;
      }
    >();
    for (const row of rows) {
      const entry = result.get(row.campaignId) ?? {
        counts: { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 },
        next: null,
        last: null,
      };
      entry.counts[row.status] = row._count._all;
      if (row.status === CampaignRecipientStatus.PENDING) {
        entry.next = row._min.scheduledAt;
        entry.last = row._max.scheduledAt;
      }
      result.set(row.campaignId, entry);
    }
    return result;
  }

  private toView(
    campaign: Prisma.CampaignGetPayload<object>,
    stats?: {
      counts: Record<CampaignRecipientStatus, number>;
      next: Date | null;
      last: Date | null;
    },
  ) {
    const counts = stats?.counts ?? {
      PENDING: 0,
      SENT: 0,
      FAILED: 0,
      SKIPPED: 0,
    };
    const template = BROADCAST_TEMPLATES.find(
      (item) => item.code === campaign.templateCode,
    );
    return {
      id: campaign.id,
      name: campaign.name,
      templateCode: campaign.templateCode,
      templateName: template?.name ?? campaign.templateCode,
      promotionId: campaign.promotionId,
      audience: campaign.audience,
      pace: campaign.pace,
      status: campaign.status,
      pausedReason: campaign.pausedReason,
      total: campaign.totalRecipients,
      sent: counts.SENT,
      failed: counts.FAILED,
      skipped: counts.SKIPPED,
      pending: counts.PENDING,
      startsAt: campaign.startsAt,
      nextSendAt: stats?.next ?? null,
      estimatedEndAt: stats?.last ?? null,
      finishedAt: campaign.finishedAt,
      createdAt: campaign.createdAt,
    };
  }
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
