import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { ClientThrottlerGuard } from './reservations/guards/client-throttler.guard';
import { PromotionsModule } from './promotions/promotions.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { DepositsModule } from './deposits/deposits.module';
import { CloudinaryModule } from './infrastructure/cloudinary/cloudinary.module';
import { getThrottlerConfig } from './config/throttler.config';
import { AuditInterceptor } from './audit/audit.interceptor';
import { MonitoringInterceptor } from './monitoring/monitoring.interceptor';
import { AuditModule } from './audit/audit.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MonitoringService } from './monitoring/monitoring.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getThrottlerConfig,
    }),
    EncryptionModule,
    CloudinaryModule,
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
    IdempotencyModule,
    AuditModule,
    MonitoringModule,
    DepositsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (monitoringService: MonitoringService) =>
        new MonitoringInterceptor(monitoringService),
      inject: [MonitoringService],
    },
    {
      provide: APP_GUARD,
      useClass: ClientThrottlerGuard,
    },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
