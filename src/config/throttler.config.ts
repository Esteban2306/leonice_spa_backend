import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import Redis from 'ioredis';

import {
  CLIENT_BOOKING_RATE_LIMIT,
  CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
} from '../reservations/domain/reservation-timing.constants';

interface ThrottledRequestUser {
  role?: string;
}

function isAdministrator(request: Request): boolean {
  const user = request.user as ThrottledRequestUser | undefined;

  return user?.role === 'ADMIN';
}

function isValidConduitRequest(
  request: Request,
  config: ConfigService,
): boolean {
  const providedKey = request.headers['x-api-key'];

  const conduitKey = config.get<string>('CONDUIT_TOOL_API_KEY');

  if (!conduitKey || typeof providedKey !== 'string') {
    return false;
  }

  return providedKey === conduitKey;
}

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(context: ExecutionContext): boolean {
  return SAFE_METHODS.has(
    context.switchToHttp().getRequest<Request>().method.toUpperCase(),
  );
}

export function shouldSkipThrottle(
  context: ExecutionContext,
  config: ConfigService,
): boolean {
  const request = context.switchToHttp().getRequest<Request>();

  if (isValidConduitRequest(request, config)) {
    return true;
  }

  if (isAdministrator(request)) {
    return true;
  }

  return false;
}

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
          const request = context.switchToHttp().getRequest<Request>();

          return (
            shouldSkipThrottle(context, config) ||
            !request.path.includes('/availability')
          );
        },
      },

      {
        name: 'reservations',
        ttl: 60_000,
        limit: config.get<number>('THROTTLE_LIMIT_RESERVATIONS', 5),
        skipIf: (context: ExecutionContext): boolean => {
          const request = context.switchToHttp().getRequest<Request>();

          return (
            shouldSkipThrottle(context, config) ||
            isSafeMethod(context) ||
            !request.path.includes('/reservations')
          );
        },
      },

      {
        name: 'client-booking',
        ttl: CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
        limit: CLIENT_BOOKING_RATE_LIMIT,
        skipIf: (context: ExecutionContext): boolean =>
          shouldSkipThrottle(context, config) || isSafeMethod(context),
      },

      {
        name: 'webhooks',
        ttl: 1_000,
        limit: config.get<number>('THROTTLE_LIMIT_WEBHOOKS', 30),
        skipIf: (context: ExecutionContext): boolean => {
          const request = context.switchToHttp().getRequest<Request>();

          return (
            shouldSkipThrottle(context, config) ||
            !request.path.includes('/integrations/conduit')
          );
        },
      },
    ],

    storage: new ThrottlerStorageRedisService(redis),

    skipIf: (context: ExecutionContext): boolean => {
      return shouldSkipThrottle(context, config);
    },
  };
}
