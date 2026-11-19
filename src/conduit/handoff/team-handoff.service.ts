import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';

export const TEAM_NOTICE_WINDOW_SECONDS = 30 * 60;

export interface HandoffRequest {
  phone: string | null;
  lid: string | null;
  reason: string;
  summary?: string | null;
  requestId?: string;
  target: 'TEAM' | 'OWNER';
}

@Injectable()
export class TeamHandoffService {
  private readonly logger = new Logger(TeamHandoffService.name);

  constructor(
    private readonly cache: SafeCacheService,
    private readonly clients: ClientsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async request(input: HandoffRequest): Promise<boolean> {
    const noticeKey = this.noticeKey(input);
    if (noticeKey) {
      const claimed = await this.cache.setIfAbsent(
        noticeKey,
        true,
        TEAM_NOTICE_WINDOW_SECONDS,
      );
      if (claimed === false) return true;
    }

    let notified = false;
    try {
      const client = input.phone
        ? await this.clients.findByPhone(input.phone)
        : null;
      const results = await this.eventBus.publishAsync(
        EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED,
        {
          phone: input.phone,
          lid: input.lid,
          clientName: client?.name ?? null,
          reason: input.reason,
          summary: input.summary ?? null,
          requestId: input.requestId ?? randomUUID(),
          target: input.target,
        },
      );
      notified = results.some(Boolean);
    } finally {
      if (noticeKey && !notified) await this.cache.delete(noticeKey);
    }
    if (!notified) {
      this.logger.warn('No se pudo avisar al equipo de un traspaso.');
    }
    return notified;
  }

  private noticeKey(input: HandoffRequest): string | null {
    if (input.target !== 'TEAM') return null;
    const contact = input.phone ?? (input.lid ? `lid:${input.lid}` : null);
    return contact ? `conduit:team-notice:${contact}` : null;
  }
}
