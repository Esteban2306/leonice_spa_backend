import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import { ClientTagsService } from './client-tags.service';

const REFRESH_EVERY_MS = 60 * 60 * 1000;
const LOCK_KEY = 'lock:client-tags-refresh';
const LOCK_TTL_SECONDS = 55 * 60;

@Injectable()
export class ClientTagsScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ClientTagsScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly tags: ClientTagsService,
    private readonly cache: SafeCacheService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), REFRESH_EVERY_MS);
    this.timer.unref();
    void this.tags
      .isEmpty()
      .then((empty) => (empty ? this.run() : undefined))
      .catch((error: unknown) => this.logFailure(error));
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const acquired = await this.cache.setIfAbsent(
        LOCK_KEY,
        new Date().toISOString(),
        LOCK_TTL_SECONDS,
      );
      if (acquired === false) return;
      await this.tags.refreshAll();
    } catch (error) {
      this.logFailure(error);
    }
  }

  private logFailure(error: unknown): void {
    this.logger.error(
      `No se pudieron actualizar las etiquetas de clientas: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
