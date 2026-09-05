import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ConduitOutboxRepository } from '../repositories/conduit-outbox.repository';

@Injectable()
export class ConduitOutboxService {
  constructor(
    private readonly repository: ConduitOutboxRepository,
    @InjectQueue(QUEUE_NAMES.CONDUIT_OUTBOX) private readonly queue: Queue,
  ) {}

  async enqueue(eventType: string, payload: unknown): Promise<void> {
    const event = await this.repository.create(eventType, payload);
    await this.queue.add(JOB_NAMES.PUBLISH_CONDUIT_EVENT, {
      outboxEventId: event.id,
    });
  }
}
