import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SafeCacheService } from './safe-cache.service';
import { RedisConnectionReporter } from './redis-connection-reporter.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService, RedisConnectionReporter],
      useFactory: (
        config: ConfigService,
        reporter: RedisConnectionReporter,
      ) => {
        const client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
          commandTimeout: 300,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,

          retryStrategy(times) {
            return Math.min(times * 100, 2_000);
          },
        });
        reporter.watchClient(client, 'Caché');
        return client;
      },
    },
    RedisConnectionReporter,
    SafeCacheService,
  ],
  exports: [REDIS_CLIENT, SafeCacheService, RedisConnectionReporter],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
