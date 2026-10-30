import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiigoSync, SiigoSyncStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SIIGO_CLIENT, type SiigoClient } from '../client/siigo.client';
import { siigoIdempotencyKey } from '../client/siigo-idempotency-key';
import { SiigoError } from '../client/siigo.errors';
import { SiigoIncomePayload } from '../domain/siigo-income-payload';
import {
  SiigoReceiptLine,
  buildSiigoReceipts,
} from '../domain/siigo-receipt-body';
import { readSiigoSettings } from '../siigo.config';
import {
  SiigoReceiptMapping,
  readSiigoReceiptMapping,
} from '../siigo-receipt-mapping';
import {
  SIIGO_CANDIDATE_LIMIT,
  SIIGO_REQUESTS_PER_SWEEP,
  decideFailure,
  describeFailure,
  isDue,
} from './siigo-sync.policy';

type ReceiptProgress = Partial<
  Record<SiigoReceiptLine, { id: string; name: string | null }>
>;

type SendOutcome = 'SYNCED' | 'RETRY' | 'FAIL' | 'BLOCK' | 'PAUSE';

export interface SweepSummary {
  skipped: boolean;
  synced: number;
  retried: number;
  failed: number;
  blocked: number;
  paused: boolean;
}

@Injectable()
export class SiigoSyncService {
  private readonly logger = new Logger(SiigoSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SIIGO_CLIENT) private readonly siigo: SiigoClient,
  ) {}

  async sweep(now: Date = new Date()): Promise<SweepSummary> {
    const summary: SweepSummary = {
      skipped: false,
      synced: 0,
      retried: 0,
      failed: 0,
      blocked: 0,
      paused: false,
    };

    if (!readSiigoSettings(this.config).enabled) {
      return { ...summary, skipped: true };
    }

    let mapping: SiigoReceiptMapping;
    try {
      mapping = readSiigoReceiptMapping(this.config);
    } catch (error) {
      this.logger.warn(describeFailure(error));
      return { ...summary, skipped: true };
    }

    const candidates = await this.prisma.client.siigoSync.findMany({
      where: {
        status: { in: [SiigoSyncStatus.PENDIENTE, SiigoSyncStatus.ENVIANDO] },
      },
      orderBy: { createdAt: 'asc' },
      take: SIIGO_CANDIDATE_LIMIT,
    });

    const budget = { remaining: SIIGO_REQUESTS_PER_SWEEP };

    for (const candidate of candidates.filter((row) => isDue(row, now))) {
      if (budget.remaining <= 0) {
        summary.paused = true;
        break;
      }
      const claimed = await this.claim(candidate);
      if (!claimed) continue;

      const outcome = await this.send(claimed, mapping, budget);
      if (outcome === 'SYNCED') summary.synced += 1;
      if (outcome === 'RETRY') summary.retried += 1;
      if (outcome === 'FAIL') summary.failed += 1;
      if (outcome === 'BLOCK') summary.blocked += 1;
      if (outcome === 'PAUSE') {
        summary.paused = true;
        break;
      }
    }

    return summary;
  }

  private async claim(row: SiigoSync): Promise<SiigoSync | null> {
    const result = await this.prisma.client.siigoSync.updateMany({
      where: { id: row.id, status: row.status, updatedAt: row.updatedAt },
      data: { status: SiigoSyncStatus.ENVIANDO, attempts: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.prisma.client.siigoSync.findUnique({ where: { id: row.id } });
  }

  private async send(
    row: SiigoSync,
    mapping: SiigoReceiptMapping,
    budget: { remaining: number },
  ): Promise<SendOutcome> {
    const done: ReceiptProgress = (row.receipts ?? {}) as ReceiptProgress;

    try {
      const receipts = buildSiigoReceipts(
        row.payload as unknown as SiigoIncomePayload,
        mapping,
      );

      for (const receipt of receipts) {
        if (done[receipt.line]) continue;
        if (budget.remaining <= 0) {
          await this.release(row, done);
          return 'PAUSE';
        }
        budget.remaining -= 1;
        const voucher = await this.siigo.createVoucher(
          receipt.body,
          siigoIdempotencyKey(row.reservationId, receipt.line),
        );
        done[receipt.line] = { id: voucher.id, name: voucher.name };
        await this.saveProgress(row.id, done);
      }

      const names = Object.values(done).map((entry) => entry.name ?? entry.id);
      await this.prisma.client.siigoSync.update({
        where: { id: row.id },
        data: {
          status: SiigoSyncStatus.SINCRONIZADO,
          syncedAt: new Date(),
          lastError: null,
          siigoDocumentId: names.length > 0 ? names.join(', ') : null,
          receipts: done,
        },
      });
      return 'SYNCED';
    } catch (error) {
      return this.recordFailure(row, done, error);
    }
  }

  private async recordFailure(
    row: SiigoSync,
    done: ReceiptProgress,
    error: unknown,
  ): Promise<Exclude<SendOutcome, 'SYNCED'>> {
    const action = decideFailure(error, row.attempts);
    const status = {
      RETRY: SiigoSyncStatus.PENDIENTE,
      PAUSE: SiigoSyncStatus.PENDIENTE,
      FAIL: SiigoSyncStatus.FALLIDO,
      BLOCK: SiigoSyncStatus.BLOQUEADO,
    }[action];

    await this.prisma.client.siigoSync.update({
      where: { id: row.id },
      data: {
        status,
        lastError: describeFailure(error),
        receipts: done,
        ...(action === 'PAUSE' ? { attempts: { decrement: 1 } } : {}),
      },
    });

    const kind = error instanceof SiigoError ? error.kind : 'INTERNAL';
    this.logger.warn(
      `Siigo ${action} para la reserva ${row.reservationId} (${kind}, intento ${row.attempts})`,
    );
    return action;
  }

  private async release(row: SiigoSync, done: ReceiptProgress): Promise<void> {
    await this.prisma.client.siigoSync.update({
      where: { id: row.id },
      data: {
        status: SiigoSyncStatus.PENDIENTE,
        attempts: { decrement: 1 },
        receipts: done,
      },
    });
  }

  private async saveProgress(id: string, done: ReceiptProgress): Promise<void> {
    await this.prisma.client.siigoSync.update({
      where: { id },
      data: { receipts: done },
    });
  }
}
