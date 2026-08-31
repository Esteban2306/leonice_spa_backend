export interface DomainEvent<T = unknown> {
  type: string;
  timestamp: Date;
  correlationId: string;
  tenantId?: string;
  payload: T;
}

export type EventOf<PayloadMap, K extends keyof PayloadMap> = DomainEvent<
  PayloadMap[K]
>;
