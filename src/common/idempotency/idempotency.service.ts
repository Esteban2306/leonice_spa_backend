import { Injectable, Logger } from '@nestjs/common';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import {
  IdempotencyDecision,
  IdempotencyRecord,
  decideIdempotency,
} from './idempotency-decision';

const IN_PROGRESS_TTL_SECONDS = 120;
const COMPLETED_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly cache: SafeCacheService) {}

  async begin(
    storeKey: string,
    fingerprint: string,
  ): Promise<IdempotencyDecision> {
    const existing = await this.cache.get<IdempotencyRecord>(storeKey);
    if (existing) return decideIdempotency(existing, fingerprint);

    const reserved = await this.cache.setIfAbsent(
      storeKey,
      { state: 'IN_PROGRESS', fingerprint } satisfies IdempotencyRecord,
      IN_PROGRESS_TTL_SECONDS,
    );
    if (reserved === null) {
      this.logger.warn(
        'Redis no disponible: la solicitud se procesa sin garantía de idempotencia',
      );
      return { kind: 'EXECUTE' };
    }
    if (reserved) return { kind: 'EXECUTE' };

    const raced = await this.cache.get<IdempotencyRecord>(storeKey);
    return decideIdempotency(
      raced ?? { state: 'IN_PROGRESS', fingerprint },
      fingerprint,
    );
  }

  complete(
    storeKey: string,
    fingerprint: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    return this.cache.set(
      storeKey,
      {
        state: 'COMPLETED',
        fingerprint,
        statusCode,
        body,
      } satisfies IdempotencyRecord,
      COMPLETED_TTL_SECONDS,
    );
  }

  abandon(storeKey: string): Promise<void> {
    return this.cache.delete(storeKey);
  }
}
