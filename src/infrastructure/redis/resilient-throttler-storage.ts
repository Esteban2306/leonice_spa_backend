import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import {
  BrokenCircuitError,
  ConsecutiveBreaker,
  TimeoutStrategy,
  circuitBreaker,
  handleAll,
  timeout,
  wrap,
} from 'cockatiel';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const PRIMARY_TIMEOUT_MS = 300;
const HALF_OPEN_AFTER_MS = 10_000;
const FAILURES_BEFORE_OPEN = 3;

export class ResilientThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(ResilientThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private degraded = false;

  private readonly policy = wrap(
    circuitBreaker(handleAll, {
      halfOpenAfter: HALF_OPEN_AFTER_MS,
      breaker: new ConsecutiveBreaker(FAILURES_BEFORE_OPEN),
    }),
    timeout(PRIMARY_TIMEOUT_MS, TimeoutStrategy.Aggressive),
  );

  constructor(private readonly primary: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const record = await this.policy.execute(() =>
        this.primary.increment(key, ttl, limit, blockDuration, throttlerName),
      );
      this.markRecovered();
      return record;
    } catch (error: unknown) {
      this.markDegraded(error);
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  onApplicationShutdown(): void {
    this.fallback.onApplicationShutdown();
  }

  private markDegraded(error: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    const reason =
      error instanceof BrokenCircuitError
        ? 'circuito abierto'
        : error instanceof Error
          ? error.message
          : String(error);
    this.logger.warn(
      `Almacén de rate limit no disponible (${reason}): se aplican límites en memoria de esta instancia hasta que Redis vuelva`,
    );
  }

  private markRecovered(): void {
    if (!this.degraded) return;
    this.degraded = false;
    this.logger.log(
      'Almacén de rate limit recuperado: límites compartidos en Redis',
    );
  }
}
