import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { REDIS_CLIENT } from 'src/infrastructure/redis/redis.constants';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check() {
    const [dbOk, redisOk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    if (!dbOk || !redisOk) {
      throw new HttpException(
        { status: 'error', database: dbOk, redis: redisOk },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      status: 'ok',
      database: true,
      redis: true,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}
