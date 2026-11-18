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

const BUSINESS_TIME_ZONE = 'America/Bogota';
const END_OF_DAY_PATTERN = '59 23 * * *';

const SWEEPS = [
  {
    schedulerId: 'deposit-expiry-sweep',
    jobName: JOB_NAMES.DEPOSIT_EXPIRY_SWEEP,
    repeat: { every: DEPOSIT_SWEEP_INTERVAL_MS },
    label: 'depósitos vencidos',
    when: `cada ${DEPOSIT_SWEEP_INTERVAL_MS / 60_000} min`,
  },
  {
    schedulerId: 'no-show-sweep',
    jobName: JOB_NAMES.NO_SHOW_SWEEP,
    repeat: { every: NO_SHOW_SWEEP_INTERVAL_MS },
    label: 'no-show',
    when: `cada ${NO_SHOW_SWEEP_INTERVAL_MS / 60_000} min`,
  },
  {
    schedulerId: 'in-progress-digest',
    jobName: JOB_NAMES.IN_PROGRESS_DIGEST,
    repeat: { pattern: END_OF_DAY_PATTERN, tz: BUSINESS_TIME_ZONE },
    label: 'citas en curso sin completar',
    when: 'todos los días a las 11:59 p. m. (Bogotá)',
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
      await this.queue.upsertJobScheduler(sweep.schedulerId, sweep.repeat, {
        name: sweep.jobName,
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      });
      this.logger.log(`Barrido de ${sweep.label} registrado ${sweep.when}`);
    }
  }
}
