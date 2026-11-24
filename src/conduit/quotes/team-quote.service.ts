import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TreatmentsService } from '../../catalog/treatments/treatments.service';
import { ConduitApiClient } from '../client/conduit-api.client';
import { matchTreatment } from '../tools/treatment-matcher';
import {
  TEAM_QUOTE_LOOKBACK_DAYS,
  TEAM_QUOTE_VALID_DAYS,
  amountsInText,
  checkTeamQuote,
} from './team-quote';

const DAY_MS = 24 * 60 * 60 * 1000;
const MESSAGE_PAGE = 100;
const MAX_UNSAVED_PRICES = 3;

interface ChatMessage {
  direction?: unknown;
  content?: unknown;
  processedBy?: unknown;
  createdAt?: unknown;
}

export type SaveTeamQuoteResult =
  | {
      saved: true;
      treatment: string;
      price: number;
      expiresAt: Date;
    }
  | {
      saved: false;
      reason:
        | 'TREATMENT_NOT_FOUND'
        | 'TREATMENT_AMBIGUOUS'
        | 'NOT_IN_CHAT'
        | 'CHAT_UNAVAILABLE';
      options?: string[];
    };

export interface ActiveTeamQuote {
  id: string;
  treatmentId: string;
  treatment: string;
  price: number;
  quotedAt: Date;
  expiresAt: Date;
}

export function toBotTeamQuote(quote: ActiveTeamQuote) {
  return {
    treatment: quote.treatment,
    price: `$${quote.price.toLocaleString('es-CO')}`,
  };
}

@Injectable()
export class TeamQuoteService {
  private readonly logger = new Logger(TeamQuoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly treatments: TreatmentsService,
    private readonly conduit: ConduitApiClient,
    private readonly config: ConfigService,
  ) {}

  async save(params: {
    phone: string;
    treatmentName: string;
    amount: number;
    now?: Date;
  }): Promise<SaveTeamQuoteResult> {
    const now = params.now ?? new Date();
    const catalog = await this.treatments.findAll();
    const match = matchTreatment(params.treatmentName, catalog);
    if (match.status === 'ambiguous') {
      return {
        saved: false,
        reason: 'TREATMENT_AMBIGUOUS',
        options: match.options.map((t) => t.name),
      };
    }
    if (match.status !== 'found') {
      return { saved: false, reason: 'TREATMENT_NOT_FOUND' };
    }

    const treatment = await this.prisma.client.treatment.findUnique({
      where: { id: match.treatment.id },
      include: { hairLengthPricing: true, hairColorSurcharges: true },
    });
    if (!treatment) return { saved: false, reason: 'TREATMENT_NOT_FOUND' };

    let messages: Array<{ text: string; at: Date }>;
    try {
      messages = await this.teamMessages(params.phone, now);
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el chat para verificar un precio: ${(error as Error).message}`,
      );
      return { saved: false, reason: 'CHAT_UNAVAILABLE' };
    }

    const check = checkTeamQuote({
      amount: params.amount,
      teamMessages: messages.map((m) => m.text),
    });
    if (!check.ok) return { saved: false, reason: check.reason };

    const source = [...messages]
      .reverse()
      .find((m) => amountsInText(m.text).includes(params.amount))!;
    const expiresAt = new Date(now.getTime() + TEAM_QUOTE_VALID_DAYS * DAY_MS);
    const values = {
      amount: params.amount,
      sourceText: source.text.slice(0, 300),
      quotedAt: source.at,
      expiresAt,
      usedAt: null,
      reservationId: null,
    };
    await this.prisma.client.teamQuote.upsert({
      where: {
        phone_treatmentId: { phone: params.phone, treatmentId: treatment.id },
      },
      create: { phone: params.phone, treatmentId: treatment.id, ...values },
      update: values,
    });
    return {
      saved: true,
      treatment: treatment.name,
      price: params.amount,
      expiresAt,
    };
  }

  async activeFor(phone: string, now = new Date()): Promise<ActiveTeamQuote[]> {
    const rows = await this.prisma.client.teamQuote.findMany({
      where: { phone, usedAt: null, expiresAt: { gt: now } },
      include: { treatment: { select: { name: true } } },
      orderBy: { quotedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      treatmentId: row.treatmentId,
      treatment: row.treatment.name,
      price: Number(row.amount),
      quotedAt: row.quotedAt,
      expiresAt: row.expiresAt,
    }));
  }

  async unsavedTeamPrices(
    phone: string,
    saved: readonly ActiveTeamQuote[],
    now = new Date(),
  ): Promise<Array<{ price: number; said: string }>> {
    let messages: Array<{ text: string; at: Date }>;
    try {
      messages = await this.teamMessages(phone, now);
    } catch {
      return [];
    }
    const savedPrices = new Set(saved.map((q) => q.price));
    const seen = new Set<number>();
    const found: Array<{ price: number; said: string }> = [];
    for (const message of [...messages].reverse()) {
      for (const price of amountsInText(message.text)) {
        if (savedPrices.has(price) || seen.has(price)) continue;
        seen.add(price);
        found.push({ price, said: message.text.slice(0, 160) });
      }
    }
    return found.slice(0, MAX_UNSAVED_PRICES);
  }

  async markUsed(
    quotes: ReadonlyArray<{ quoteId: string; reservationId: string }>,
    now = new Date(),
  ): Promise<void> {
    await Promise.all(
      quotes.map(({ quoteId, reservationId }) =>
        this.prisma.client.teamQuote.updateMany({
          where: { id: quoteId, usedAt: null },
          data: { usedAt: now, reservationId },
        }),
      ),
    );
  }

  private async teamMessages(
    phone: string,
    now: Date,
  ): Promise<Array<{ text: string; at: Date }>> {
    const botId = this.config.get<string>('CONDUIT_DEFAULT_BOT_ID');
    if (!botId) throw new Error('CONDUIT_DEFAULT_BOT_ID sin configurar');
    const digits = phone.replace(/\D/g, '');
    const page = await this.conduit.admin<{
      data?: Array<{ id?: unknown; phoneNumber?: unknown; closedAt?: unknown }>;
    }>('GET', `bots/${botId}/conversations`, {
      query: { search: digits, limit: 5 },
    });
    const conversation = (page?.data ?? []).find(
      (c) => typeof c.phoneNumber === 'string' && c.phoneNumber === digits,
    );
    if (!conversation || typeof conversation.id !== 'string') return [];

    const rows = await this.conduit.admin<ChatMessage[]>(
      'GET',
      `bots/${botId}/conversations/${conversation.id}/messages`,
      { query: { limit: MESSAGE_PAGE } },
    );
    const closedAt =
      typeof conversation.closedAt === 'string'
        ? new Date(conversation.closedAt).getTime()
        : Number.NaN;
    const since = Math.max(
      now.getTime() - TEAM_QUOTE_LOOKBACK_DAYS * DAY_MS,
      Number.isNaN(closedAt) ? 0 : closedAt,
    );
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      if (row.processedBy !== 'human' || row.direction !== 'OUTBOUND') {
        return [];
      }
      const at = new Date(String(row.createdAt));
      if (typeof row.content !== 'string' || Number.isNaN(at.getTime())) {
        return [];
      }
      return at.getTime() >= since ? [{ text: row.content, at }] : [];
    });
  }
}
