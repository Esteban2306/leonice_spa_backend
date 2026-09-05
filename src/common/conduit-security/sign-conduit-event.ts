import { createHmac } from 'node:crypto';

export interface SignedConduitPayload {
  rawBody: string;
  headers: {
    'X-Conduit-Integration-Id': string;
    'X-Conduit-Timestamp': string;
    'X-Conduit-Signature': string;
    'X-Conduit-Event-Id': string;
    'Content-Type': 'application/json';
  };
}

export function signConduitEvent(params: {
  payload: unknown;
  integrationId: string;
  integrationSecret: string;
  eventId: string;
}): SignedConduitPayload {
  const rawBody = JSON.stringify(params.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac('sha256', params.integrationSecret).update(`${timestamp}.${rawBody}`).digest('hex')}`;

  return {
    rawBody,
    headers: {
      'X-Conduit-Integration-Id': params.integrationId,
      'X-Conduit-Timestamp': timestamp,
      'X-Conduit-Signature': signature,
      'X-Conduit-Event-Id': params.eventId,
      'Content-Type': 'application/json',
    },
  };
}
