import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../infrastructure/queue/queue.constants';
import { DEPOSIT_SWEEP_INTERVAL_MS } from '../reservations/domain/reservation-timing.constants';

const SWEEP_SCHEDULER_ID = 'deposit-expiry-sweep';

@Injectable()
export class DepositExpirySweepScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DepositExpirySweepScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SWEEP_SCHEDULER_ID,
      { every: DEPOSIT_SWEEP_INTERVAL_MS },
      {
        name: JOB_NAMES.DEPOSIT_EXPIRY_SWEEP,
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      },
    );
    this.logger.log(
      `Barrido de depósitos vencidos registrado cada ${DEPOSIT_SWEEP_INTERVAL_MS / 60_000} min`,
    );
  }
}
