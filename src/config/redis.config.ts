import { ConfigService } from '@nestjs/config';

export function getRedisUrl(config: ConfigService) {
  return config.getOrThrow<string>('REDIS_URL');
}
