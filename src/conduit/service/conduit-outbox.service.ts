import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ConduitOutboxRepository } from '../repositories/conduit-outbox.repository';

export const OUTBOX_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
export const OUTBOX_STALE_AFTER_MS = 5 * 60 * 1000;
export const OUTBOX_SWEEP_BATCH = 100;

export const outboxJobId = (outboxEventId: string) => `outbox-${outboxEventId}`;

@Injectable()
export class ConduitOutboxService {
  private readonly logger = new Logger(ConduitOutboxService.name);

  constructor(
    private readonly repository: ConduitOutboxRepository,
    @InjectQueue(QUEUE_NAMES.CONDUIT_OUTBOX) private readonly queue: Queue,
  ) {}

  async enqueue(eventType: string, payload: unknown): Promise<void> {
    const event = await this.repository.create(eventType, payload);
    try {
      await this.publish(event.id);
    } catch (error) {
      this.logger.warn(
        `Evento outbox ${event.id} (${eventType}) guardado pero no encolado: ${(error as Error).message}. El barrido lo reintentará.`,
      );
    }
  }

  async sweepPending(now = new Date()): Promise<number> {
    const stale = await this.repository.findStalePending(
      new Date(now.getTime() - OUTBOX_STALE_AFTER_MS),
      OUTBOX_SWEEP_BATCH,
    );
    for (const event of stale) {
      await this.publish(event.id);
    }
    if (stale.length > 0) {
      this.logger.warn(
        `Barrido del outbox: ${stale.length} evento(s) pendiente(s) reencolado(s)`,
      );
    }
    return stale.length;
  }

  /** Reintento manual desde el panel de un evento que no llegó a Conduit. */
  async retry(id: string): Promise<boolean> {
    const event = await this.repository.findById(id);
    if (!event || event.status === 'SENT') return false;

    await this.repository.resetToPending(id);
    await this.queue.add(
      JOB_NAMES.PUBLISH_CONDUIT_EVENT,
      { outboxEventId: id },
      { jobId: `outbox-retry-${id}-${Date.now()}` },
    );
    return true;
  }

  private async publish(outboxEventId: string): Promise<void> {
    await this.queue.add(
      JOB_NAMES.PUBLISH_CONDUIT_EVENT,
      { outboxEventId },
      { jobId: outboxJobId(outboxEventId) },
    );
  }
}
