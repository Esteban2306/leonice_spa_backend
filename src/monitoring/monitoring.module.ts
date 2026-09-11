import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'leonice_spa_',
        },
      },
    }),
  ],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    {
      provide: 'PROM_METRIC_HTTP_REQUEST_TOTAL',
      useValue: new Counter({
        name: 'http_request_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'path', 'status'],
      }),
    },
    {
      provide: 'PROM_METRIC_HTTP_REQUEST_DURATION_SECONDS',
      useValue: new Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'path'],
        buckets: [0.1, 0.3, 0.5, 0.7, 0.9, 1, 2, 3, 5],
      }),
    },
    {
      provide: 'PROM_METRIC_ACTIVE_DB_CONNECTIONS',
      useValue: new Gauge({
        name: 'active_db_connections',
        help: 'Number of active database connections',
      }),
    },
    {
      provide: 'PROM_METRIC_REDIS_MEMORY_USAGE',
      useValue: new Gauge({
        name: 'redis_memory_usage',
        help: 'Redis memory usage ratio',
      }),
    },
    {
      provide: 'PROM_METRIC_THROTTLER_REJECTED',
      useValue: new Counter({
        name: 'throttler_rejected',
        help: 'Number of requests rejected by throttler',
        labelNames: ['path'],
      }),
    },
  ],
  exports: [MonitoringService],
})
export class MonitoringModule {}
