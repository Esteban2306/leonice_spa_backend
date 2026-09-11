import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

@Injectable()
export class MonitoringService {
  constructor(
    @InjectMetric('http_request_total')
    public readonly httpRequestTotal: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    public readonly httpRequestDuration: Histogram<string>,
    @InjectMetric('active_db_connections')
    public activeDbConnections: Gauge<string>,
    @InjectMetric('redis_memory_usage')
    public redisMemoryUsage: Gauge<string>,
    @InjectMetric('throttler_rejected')
    public throttlerRejected: Counter<string>,
  ) {}

  incrementHttpRequests(method: string, path: string, status: number) {
    this.httpRequestTotal.inc({
      method,
      path: this.normalizePath(path),
      status: status.toString(),
    });
  }

  observeRequestDuration(method: string, path: string, duration: number) {
    this.httpRequestDuration.observe(
      { method, path: this.normalizePath(path) },
      duration,
    );
  }

  setActiveDbConnections(count: number) {
    this.activeDbConnections.set(count);
  }

  setRedisMemoryUsage(used: number, total: number) {
    this.redisMemoryUsage.set(used / total);
  }

  incrementThrottlerRejected(path: string) {
    this.throttlerRejected.inc({ path: this.normalizePath(path) });
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\/\w+$/, '/:id')
      .replace(/\/\w+-\w+-\w+-\w+-\w+$/, '/:uuid');
  }
}
