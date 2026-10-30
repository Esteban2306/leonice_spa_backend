import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { SIIGO_SWEEP_INTERVAL_MS } from './siigo-sync.policy';

@Injectable()
export class SiigoSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SiigoSyncScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SIIGO_SYNC) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'siigo-sync-sweep',
      { every: SIIGO_SWEEP_INTERVAL_MS },
      {
        name: JOB_NAMES.SIIGO_SYNC_SWEEP,
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      },
    );
    this.logger.log(
      `Barrido de Siigo registrado cada ${SIIGO_SWEEP_INTERVAL_MS / 1000} s`,
    );
  }
}
