import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  startTime: number;
  userId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getCorrelationId(): string {
    return this.storage.getStore()?.correlationId ?? 'sin-correlacion';
  }

  setUserId(userId: string): void {
    const store = this.storage.getStore();
    if (store) store.userId = userId;
  }
}
