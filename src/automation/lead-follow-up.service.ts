import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
} from '@prisma/client';
import {
  ConduitApiClient,
  type ConduitSendContext,
} from '../conduit/client/conduit-api.client';
import { ConduitTemplateResolver } from '../conduit/templates/conduit-template-resolver';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ANONYMIZED_PHONE_PREFIX } from '../client-privacy/anonymized-client';
import { AutomationExecutionRepository } from './repositories/automation-execution.repository';
import { OPERATIONAL_TEMPLATE_ENV_KEYS } from './domain/operational-notifications.constants';
import {
  LEAD_FOLLOW_UP_BATCH,
  leadWindow,
  mutedPhones,
  phoneDigits,
} from './lead-follow-up';

export interface LeadFollowUpSummary {
  sent: number;
  skipped: number;
}

@Injectable()
export class LeadFollowUpService {
  private readonly logger = new Logger(LeadFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conduit: ConduitApiClient,
    private readonly templates: ConduitTemplateResolver,
    private readonly executions: AutomationExecutionRepository,
    private readonly config: ConfigService,
  ) {}

  async sweep(
    ctx: ConduitSendContext,
    now: Date = new Date(),
  ): Promise<LeadFollowUpSummary> {
    const summary: LeadFollowUpSummary = { sent: 0, skipped: 0 };
    const settings = await this.prisma.client.businessSettings.findUnique({
      where: { id: 'default' },
      select: { leadFollowUpEnabled: true },
    });
    if (!settings?.leadFollowUpEnabled) return summary;

    const { from, until } = leadWindow(now);
    const leads = await this.prisma.client.client.findMany({
      where: {
        createdAt: { gte: from, lte: until },
        leadFollowUpSentAt: null,
        reservations: { none: {} },
        NOT: { phone: { startsWith: ANONYMIZED_PHONE_PREFIX } },
      },
      orderBy: { createdAt: 'asc' },
      take: LEAD_FOLLOW_UP_BATCH,
      select: { id: true, phone: true, name: true },
    });
    if (leads.length === 0) return summary;

    const muted = await this.mutedPhones();
    if (!muted) return summary;
    const templateId = await this.templates.resolve(
      OPERATIONAL_TEMPLATE_ENV_KEYS.CLIENT_LEAD_FOLLOW_UP,
    );
    if (!templateId) {
      this.logger.warn(
        'No hay plantilla de seguimiento a interesadas en Conduit; no se envió nada',
      );
      return summary;
    }

    for (const lead of leads) {
      const claimed = await this.prisma.client.client.updateMany({
        where: { id: lead.id, leadFollowUpSentAt: null },
        data: { leadFollowUpSentAt: now },
      });
      if (claimed.count === 0) continue;

      if (muted.has(phoneDigits(lead.phone))) {
        summary.skipped += 1;
        await this.log(
          lead.id,
          AutomationExecutionResult.SKIPPED,
          'Número silenciado en Conduit',
        );
        continue;
      }

      const result = await this.conduit.sendWhatsappMessage({
        phone: lead.phone,
        templateId,
        variables: { nombre: lead.name.trim().split(/\s+/)[0] },
        idempotencyKey: `${ctx.idempotencyKey}:${lead.id}`,
        companyEventId: ctx.companyEventId,
      });
      if (result.delivered) {
        summary.sent += 1;
        await this.log(lead.id, AutomationExecutionResult.EXECUTED);
      } else {
        summary.skipped += 1;
        await this.log(
          lead.id,
          AutomationExecutionResult.FAILED,
          result.reason ?? 'Conduit no confirmó el envío',
        );
      }
    }
    return summary;
  }

  private async mutedPhones(): Promise<Set<string> | null> {
    const botId = this.config.get<string>('CONDUIT_DEFAULT_BOT_ID');
    if (!botId) return null;
    try {
      const rows = await this.conduit.admin<Array<{ address?: unknown }>>(
        'GET',
        `bots/${botId}/muted-contacts`,
      );
      if (!Array.isArray(rows)) {
        this.logger.warn(
          'La lista de números silenciados llegó con un formato inesperado; el seguimiento queda para mañana',
        );
        return null;
      }
      return mutedPhones(rows);
    } catch (error) {
      this.logger.warn(
        `No se pudo leer los números silenciados; el seguimiento queda para mañana: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private log(
    clientId: string,
    result: AutomationExecutionResult,
    reason?: string,
  ) {
    return this.executions.log({
      type: AutomationExecutionType.CLIENT_LEAD_FOLLOW_UP,
      result,
      clientId,
      reason,
    });
  }
}
