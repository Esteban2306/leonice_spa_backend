import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ClientAnonymizationService } from './client-anonymization.service';
import { ANONYMIZED_PHONE_PREFIX } from './anonymized-client';

const SWEEP_BATCH_SIZE = 100;
const PRODUCTION_DEFAULT_MONTHS = 36;

export interface RetentionSweepResult {
  enabled: boolean;
  examined: number;
  anonymized: number;
  skipped: number;
}

export function retentionCutoff(now: Date, months: number): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

@Injectable()
export class ClientRetentionService {
  private readonly logger = new Logger(ClientRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly anonymization: ClientAnonymizationService,
  ) {}

  inactiveMonths(): number {
    const configured = Number(
      this.config.get<string>('DATA_RETENTION_INACTIVE_MONTHS') ??
        (process.env.NODE_ENV === 'production' ? PRODUCTION_DEFAULT_MONTHS : 0),
    );
    return Number.isFinite(configured) && configured > 0
      ? Math.floor(configured)
      : 0;
  }

  async sweep(now: Date = new Date()): Promise<RetentionSweepResult> {
    const months = this.inactiveMonths();
    if (months === 0) {
      return { enabled: false, examined: 0, anonymized: 0, skipped: 0 };
    }
    const cutoff = retentionCutoff(now, months);

    const candidates = await this.prisma.client.client.findMany({
      where: {
        phone: { not: { startsWith: ANONYMIZED_PHONE_PREFIX } },
        createdAt: { lt: cutoff },
        reservations: {
          none: {
            OR: [
              { scheduledStart: { gte: cutoff } },
              { updatedAt: { gte: cutoff } },
            ],
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: SWEEP_BATCH_SIZE,
    });

    let anonymized = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        await this.anonymization.anonymize(candidate.id);
        anonymized += 1;
      } catch (error) {
        skipped += 1;
        const blocked =
          error instanceof AppException &&
          (error.code === 'CLIENT_HAS_ACTIVE_RESERVATIONS' ||
            error.code === 'CLIENT_HAS_AVAILABLE_CREDIT');
        if (!blocked) {
          this.logger.error(
            `Retención: no se pudo anonimizar ${candidate.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    this.logger.log(
      `Retención (${months} meses): ${candidates.length} candidatos, ${anonymized} anonimizados, ${skipped} omitidos`,
    );
    return {
      enabled: true,
      examined: candidates.length,
      anonymized,
      skipped,
    };
  }
}
