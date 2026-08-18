import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import {
  ConsecutiveBreaker,
  TimeoutStrategy,
  circuitBreaker,
  handleAll,
  timeout,
  wrap,
} from 'cockatiel';

@Injectable()
export class SafeCacheService {
  private readonly logger = new Logger(SafeCacheService.name);

  private readonly policy = wrap(
    circuitBreaker(handleAll, {
      halfOpenAfter: 10_000,
      breaker: new ConsecutiveBreaker(5),
    }),
    timeout(300, TimeoutStrategy.Aggressive),
  );

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.policy.execute(() => this.redis.get(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(
        `Caché no disponible al leer "${key}": ${(error as Error).message}`,
      );
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.policy.execute(() =>
        this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds),
      );
    } catch (error) {
      this.logger.warn(
        `Caché no disponible al escribir "${key}": ${(error as Error).message}`,
      );
    }
  }
}
