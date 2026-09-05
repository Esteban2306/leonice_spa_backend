import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.RESERVATION_TIMEOUTS,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
        },
      },
      {
        name: QUEUE_NAMES.AUTOMATION_COMMUNICATIONS,
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      },
      {
        name: QUEUE_NAMES.CONDUIT_OUTBOX,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
