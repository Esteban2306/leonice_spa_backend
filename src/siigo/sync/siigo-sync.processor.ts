import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { SiigoSyncService } from './siigo-sync.service';

@Processor(QUEUE_NAMES.SIIGO_SYNC)
export class SiigoSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SiigoSyncProcessor.name);

  constructor(private readonly sync: SiigoSyncService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_NAMES.SIIGO_SYNC_SWEEP) return;
    const summary = await this.sync.sweep();
    if (summary.skipped) return;
    const handled =
      summary.synced + summary.retried + summary.failed + summary.blocked;
    if (handled > 0) {
      this.logger.log(
        `Siigo: ${summary.synced} sincronizados, ${summary.retried} a reintentar, ${summary.failed} fallidos, ${summary.blocked} bloqueados`,
      );
    }
  }
}
