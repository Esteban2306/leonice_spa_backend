import { Injectable, Logger } from '@nestjs/common';
import { ConduitApiClient } from '../client/conduit-api.client';

export interface SystemPauseState {
  paused: boolean;
  pausedAt: string | null;
}

const CACHE_TTL_MS = 5_000;
const NOT_PAUSED: SystemPauseState = { paused: false, pausedAt: null };

@Injectable()
export class ConduitSystemPauseService {
  private readonly logger = new Logger(ConduitSystemPauseService.name);
  private last: SystemPauseState | null = null;
  private expiresAt = 0;

  constructor(private readonly conduit: ConduitApiClient) {}

  async get(): Promise<SystemPauseState> {
    if (this.last && this.expiresAt > Date.now()) return this.last;
    try {
      const state = await this.conduit.admin<SystemPauseState>(
        'GET',
        'system/pause',
      );
      return this.remember(state);
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la pausa del sistema; se usa el último estado conocido: ${(error as Error).message}`,
      );
      return this.last ?? NOT_PAUSED;
    }
  }

  async isPaused(): Promise<boolean> {
    return (await this.get()).paused;
  }

  async set(paused: boolean): Promise<SystemPauseState> {
    const state = await this.conduit.admin<SystemPauseState>(
      'PUT',
      'system/pause',
      { body: { paused } },
    );
    return this.remember(state);
  }

  private remember(state: SystemPauseState): SystemPauseState {
    this.last = { paused: state.paused, pausedAt: state.pausedAt ?? null };
    this.expiresAt = Date.now() + CACHE_TTL_MS;
    return this.last;
  }
}
