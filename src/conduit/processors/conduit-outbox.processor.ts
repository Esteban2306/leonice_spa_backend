import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConduitOutboxStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { ConduitOutboxRepository } from '../repositories/conduit-outbox.repository';
import { ConduitApiClient } from '../client/conduit-api.client';

interface PublishConduitEventJobData {
  outboxEventId: string;
}

@Processor(QUEUE_NAMES.CONDUIT_OUTBOX)
export class ConduitOutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(ConduitOutboxProcessor.name);

  constructor(
    private readonly repository: ConduitOutboxRepository,
    private readonly conduitApiClient: ConduitApiClient,
  ) {
    super();
  }

  async process(job: Job<PublishConduitEventJobData>): Promise<void> {
    const event = await this.repository.findById(job.data.outboxEventId);

    if (!event) {
      this.logger.warn(
        `Evento de outbox ${job.data.outboxEventId} ya no existe — se omite`,
      );
      return;
    }
    if (event.status === ConduitOutboxStatus.SENT) {
      return;
    }

    await this.conduitApiClient.pushBusinessEvent({
      eventType: event.eventType,
      eventId: event.id,
      payload: event.payload,
    });
    await this.repository.markSent(event.id);
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<PublishConduitEventJobData> | undefined,
    error: Error,
  ) {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade < maxAttempts) {
      this.logger.warn(
        `Intento ${job.attemptsMade}/${maxAttempts} fallido para evento outbox ${job.data.outboxEventId}: ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `Evento outbox ${job.data.outboxEventId} agotó sus ${maxAttempts} intentos: ${error.message}`,
      error.stack,
    );
    await this.repository.markFailed(job.data.outboxEventId, error.message);
  }
}
