import { InjectQueue, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { RedisConnectionReporter } from '../redis/redis-connection-reporter.service';
import { QUEUE_NAMES } from './queue.constants';

@Injectable()
export class QueueConnectionMonitor
  implements OnModuleInit, OnApplicationBootstrap
{
  constructor(
    private readonly reporter: RedisConnectionReporter,
    private readonly discovery: DiscoveryService,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly reservationTimeouts: Queue,
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly automationCommunications: Queue,
    @InjectQueue(QUEUE_NAMES.CONDUIT_OUTBOX)
    private readonly conduitOutbox: Queue,
  ) {}

  onModuleInit(): void {
    for (const queue of [
      this.reservationTimeouts,
      this.automationCommunications,
      this.conduitOutbox,
    ]) {
      this.reporter.watch(queue, `Cola ${queue.name}`);
    }
  }

  onApplicationBootstrap(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance: unknown = wrapper.instance;
      if (!(instance instanceof WorkerHost)) continue;
      const worker: Worker = (instance as WorkerHost<Worker>).worker;
      this.reporter.watch(worker, `Worker ${worker.name}`);
    }
  }
}
