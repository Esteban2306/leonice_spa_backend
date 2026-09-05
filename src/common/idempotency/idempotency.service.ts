import { Injectable } from '@nestjs/common';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';

const IDEMPOTENCY_KEY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly cache: SafeCacheService) {}

  findExisting(key: string): Promise<StoredResponse | null> {
    return this.cache.get<StoredResponse>(this.buildKey(key));
  }

  store(key: string, response: StoredResponse): Promise<void> {
    return this.cache.set(
      this.buildKey(key),
      response,
      IDEMPOTENCY_TTL_SECONDS,
    );
  }

  private buildKey(key: string): string {
    return `${IDEMPOTENCY_KEY_PREFIX}${key}`;
  }
}
