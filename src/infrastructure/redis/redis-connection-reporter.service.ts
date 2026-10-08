import { Injectable, Logger } from '@nestjs/common';

export const REDIS_OUTAGE_LOG_INTERVAL_MS = 60_000;

export interface RedisErrorSource {
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface RedisReadySource {
  on(event: 'ready', listener: () => void): unknown;
}

interface Outage {
  since: number;
  lastErrorAt: number;
  lastLoggedAt: number;
  failures: number;
}

function describeError(error: Error): string {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' ? code : error.message || error.name;
}

@Injectable()
export class RedisConnectionReporter {
  private readonly logger = new Logger('Redis');
  private readonly outages = new Map<string, Outage>();

  watch(emitter: RedisErrorSource, source: string): void {
    emitter.on('error', (error) => this.reportError(source, error));
  }

  watchClient(
    client: RedisErrorSource & RedisReadySource,
    source: string,
  ): void {
    this.watch(client, source);
    client.on('ready', () => this.reportRecovered(source));
  }

  reportError(source: string, error: Error, now = Date.now()): void {
    const outage = this.outages.get(source);
    if (!outage || now - outage.lastErrorAt > REDIS_OUTAGE_LOG_INTERVAL_MS) {
      this.outages.set(source, {
        since: now,
        lastErrorAt: now,
        lastLoggedAt: now,
        failures: 1,
      });
      this.logger.warn(
        `${source}: sin conexión a Redis (${describeError(error)}). Se reintenta en segundo plano.`,
      );
      return;
    }

    outage.failures += 1;
    outage.lastErrorAt = now;
    if (now - outage.lastLoggedAt >= REDIS_OUTAGE_LOG_INTERVAL_MS) {
      outage.lastLoggedAt = now;
      this.logger.warn(
        `${source}: Redis sigue sin conexión (${outage.failures} intentos fallidos desde ${new Date(outage.since).toISOString()}).`,
      );
    }
  }

  reportRecovered(source: string): void {
    if (!this.outages.delete(source)) return;
    this.logger.log(`${source}: conexión a Redis restablecida.`);
  }
}
