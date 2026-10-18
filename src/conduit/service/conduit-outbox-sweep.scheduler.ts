import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { OUTBOX_SWEEP_INTERVAL_MS } from './conduit-outbox.service';

@Injectable()
export class ConduitOutboxSweepScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConduitOutboxSweepScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.CONDUIT_OUTBOX)
    private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'conduit-outbox-sweep',
      { every: OUTBOX_SWEEP_INTERVAL_MS },
      {
        name: JOB_NAMES.CONDUIT_OUTBOX_SWEEP,
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      },
    );
    this.logger.log(
      `Barrido del outbox de Conduit registrado cada ${OUTBOX_SWEEP_INTERVAL_MS / 60_000} min`,
    );
  }
}
