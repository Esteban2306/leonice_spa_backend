import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import Redis from 'ioredis';
import { Request } from 'express';
import {
  CLIENT_BOOKING_RATE_LIMIT,
  CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
} from 'src/reservations/domain/reservation-timing.constants';
import { ExecutionContext } from '@nestjs/common';

export function getThrottlerConfig(
  config: ConfigService,
): ThrottlerModuleOptions {
  const redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
    commandTimeout: 300,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times: number): number {
      return Math.min(times * 100, 2_000);
    },
  });

  return {
    throttlers: [
      {
        name: 'default',
        ttl: 60_000,
        limit: config.get<number>('THROTTLE_LIMIT_DEFAULT', 100),
      },
      {
        name: 'availability',
        ttl: 10_000,
        limit: config.get<number>('THROTTLE_LIMIT_AVAILABILITY', 10),
        skipIf: (context: ExecutionContext): boolean => {
          const req: Request = context.switchToHttp().getRequest<Request>();
          return !req.path.includes('/availability');
        },
      },
      {
        name: 'reservations',
        ttl: 60_000,
        limit: config.get<number>('THROTTLE_LIMIT_RESERVATIONS', 5),
        skipIf: (context: ExecutionContext): boolean => {
          const req: Request = context.switchToHttp().getRequest<Request>();
          return !req.path.includes('/reservations');
        },
      },
      {
        name: 'client-booking',
        ttl: CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
        limit: CLIENT_BOOKING_RATE_LIMIT,
      },
      {
        name: 'webhooks',
        ttl: 1_000,
        limit: config.get<number>('THROTTLE_LIMIT_WEBHOOKS', 30),
        skipIf: (context: ExecutionContext): boolean => {
          const req: Request = context.switchToHttp().getRequest<Request>();
          return !req.path.includes('/integrations/conduit');
        },
      },
    ],
    storage: new ThrottlerStorageRedisService(redis),
    skipIf: (context: ExecutionContext): boolean => {
      const req: Request = context.switchToHttp().getRequest<Request>();
      const providedKey: string | undefined = req.headers['x-api-key'] as
        string | undefined;
      const conduitKey: string | undefined = config.get<string>(
        'CONDUIT_TOOL_API_KEY',
      );
      return Boolean(conduitKey && providedKey === conduitKey);
    },
  };
}
