import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { DomainEvent } from './interface/event.interface';
import { EventPayloadMap, EventType } from './constants/event.types';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly requestContext: RequestContextService,
  ) {}

  publish<K extends EventType>(
    type: K,
    payload: EventPayloadMap[K],
    options?: { correlationId?: string; tenantId?: string },
  ): void {
    const event = this.buildEvent(type, payload, options);
    this.logger.debug(`[EVENT] ${type} | ${event.correlationId}`);
    this.eventEmitter.emit(type, event);
  }

  async publishAsync<K extends EventType>(
    type: K,
    payload: EventPayloadMap[K],
    options?: { correlationId?: string; tenantId?: string },
  ): Promise<boolean[]> {
    const event = this.buildEvent(type, payload, options);
    const results: unknown[] = await this.eventEmitter.emitAsync(type, event);
    return results as boolean[];
  }

  private buildEvent<K extends EventType>(
    type: K,
    payload: EventPayloadMap[K],
    options?: { correlationId?: string; tenantId?: string },
  ): DomainEvent<EventPayloadMap[K]> {
    return {
      type,
      timestamp: new Date(),
      correlationId:
        options?.correlationId ??
        this.requestContext.get()?.correlationId ??
        randomUUID(),
      tenantId: options?.tenantId,
      payload,
    };
  }
}
