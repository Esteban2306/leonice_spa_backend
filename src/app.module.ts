import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { EncryptionModule } from './infrastructure/encryption/encryption.module';
import { ClientsModule } from './clients/clients.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ContextModule } from './common/context/context.module';
import { LoggingModule } from './common/logging/logging.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConduitModule } from './conduit/conduit.module';
import { CatalogModule } from './catalog/catalog.module';
import { ProductsModule } from './products/products.module';
import { EventModule } from './common/events/event.module';
import { QueueModule } from './infrastructure/queue/bullmq.module';
import { AutomationModule } from './automation/automation.module';
import {
  CLIENT_BOOKING_RATE_LIMIT,
  CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
} from './reservations/domain/reservation-timing.constants';
import { ClientThrottlerGuard } from './reservations/guards/client-throttler.guard';
import { PromotionsModule } from './promotions/promotions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: seconds(60),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
          {
            name: 'client-booking',
            ttl: CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
            limit: CLIENT_BOOKING_RATE_LIMIT,
          },
        ],

        storage: new ThrottlerStorageRedisService(
          new Redis(config.getOrThrow<string>('REDIS_URL')),
        ),
      }),
    }),
    EncryptionModule,
    EventModule,
    RedisModule,
    PrismaModule,
    ContextModule,
    LoggingModule,
    AuthModule,
    ClientsModule,
    ReservationsModule,
    ConduitModule,
    ProductsModule,
    CatalogModule,
    QueueModule,
    AutomationModule,
    PromotionsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ClientThrottlerGuard,
    },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
