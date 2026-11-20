import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';

export const TEAM_NOTICE_WINDOW_SECONDS = 30 * 60;
export const HAIR_PHOTO_NOTICE_WINDOW_SECONDS = 10 * 60;

export interface HandoffRequest {
  phone: string | null;
  lid: string | null;
  reason: string;
  summary?: string | null;
  requestId?: string;
  target: 'TEAM' | 'OWNER';
  kind?: 'HANDOFF' | 'HAIR_PHOTO';
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
    const hairPhoto = input.kind === 'HAIR_PHOTO';
    const noticeKey = this.noticeKey(input);
    const claimKey = hairPhoto ? this.hairPhotoKey(input) : noticeKey;
    if (claimKey) {
      const claimed = await this.cache.setIfAbsent(
        claimKey,
        true,
        hairPhoto
          ? HAIR_PHOTO_NOTICE_WINDOW_SECONDS
          : TEAM_NOTICE_WINDOW_SECONDS,
      );
      if (claimed === false) return true;
    }
    const heldTeamWindow =
      hairPhoto && noticeKey
        ? (await this.cache.setIfAbsent(
            noticeKey,
            true,
            TEAM_NOTICE_WINDOW_SECONDS,
          )) === true
        : false;

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
      if (!notified) {
        if (claimKey) await this.cache.delete(claimKey);
        if (heldTeamWindow && noticeKey) await this.cache.delete(noticeKey);
      }
    }
    if (!notified) {
      this.logger.warn('No se pudo avisar al equipo de un traspaso.');
    }
    return notified;
  }

  private noticeKey(input: HandoffRequest): string | null {
    if (input.target !== 'TEAM') return null;
    const contact = this.contact(input);
    return contact ? `conduit:team-notice:${contact}` : null;
  }

  private hairPhotoKey(input: HandoffRequest): string | null {
    const contact = this.contact(input);
    return contact ? `conduit:hair-photo-notice:${contact}` : null;
  }

  private contact(input: HandoffRequest): string | null {
    return input.phone ?? (input.lid ? `lid:${input.lid}` : null);
  }
}
