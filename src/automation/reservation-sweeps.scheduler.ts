import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../infrastructure/queue/queue.constants';
import {
  DEPOSIT_SWEEP_INTERVAL_MS,
  NO_SHOW_SWEEP_INTERVAL_MS,
} from '../reservations/domain/reservation-timing.constants';

const SWEEPS = [
  {
    schedulerId: 'deposit-expiry-sweep',
    jobName: JOB_NAMES.DEPOSIT_EXPIRY_SWEEP,
    everyMs: DEPOSIT_SWEEP_INTERVAL_MS,
    label: 'depósitos vencidos',
  },
  {
    schedulerId: 'no-show-sweep',
    jobName: JOB_NAMES.NO_SHOW_SWEEP,
    everyMs: NO_SHOW_SWEEP_INTERVAL_MS,
    label: 'no-show',
  },
] as const;

@Injectable()
export class ReservationSweepsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReservationSweepsScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const sweep of SWEEPS) {
      await this.queue.upsertJobScheduler(
        sweep.schedulerId,
        { every: sweep.everyMs },
        {
          name: sweep.jobName,
          data: {},
          opts: {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `Barrido de ${sweep.label} registrado cada ${sweep.everyMs / 60_000} min`,
      );
    }
  }
}
