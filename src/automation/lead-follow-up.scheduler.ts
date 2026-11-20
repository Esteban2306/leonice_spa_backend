import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../infrastructure/queue/queue.constants';

const SCHEDULER_ID = 'lead-follow-up-sweep';
const DAILY_AT_10_30 = '30 10 * * *';

@Injectable()
export class LeadFollowUpScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeadFollowUpScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { pattern: DAILY_AT_10_30, tz: 'America/Bogota' },
        {
          name: JOB_NAMES.LEAD_FOLLOW_UP_SWEEP,
          data: {},
          opts: {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 20 },
          },
        },
      );
      this.logger.log(
        'Seguimiento a interesadas registrado a diario a las 10:30 (solo envía si está activo en el panel)',
      );
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el seguimiento a interesadas: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
