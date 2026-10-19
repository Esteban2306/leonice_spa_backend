import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../infrastructure/queue/queue.constants';
import { ClientRetentionService } from './client-retention.service';

const SCHEDULER_ID = 'client-retention-sweep';
const DAILY_AT_3AM = '0 3 * * *';

@Injectable()
export class ClientRetentionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClientRetentionScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
    private readonly retention: ClientRetentionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const months = this.retention.inactiveMonths();
    try {
      if (months === 0) {
        await this.queue.removeJobScheduler(SCHEDULER_ID);
        this.logger.log('Retención de clientes inactivos desactivada');
        return;
      }
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { pattern: DAILY_AT_3AM, tz: 'America/Bogota' },
        {
          name: JOB_NAMES.CLIENT_RETENTION_SWEEP,
          data: {},
          opts: {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 20 },
          },
        },
      );
      this.logger.log(
        `Retención de clientes inactivos (${months} meses) registrada a diario a las 3:00`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la retención de clientes: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
