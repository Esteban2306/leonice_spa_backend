import { createHmac } from 'node:crypto';
import { signConduitEvent } from './sign-conduit-event';

describe('signConduitEvent', () => {
  it('produce una firma verificable con el mismo secreto', () => {
    const result = signConduitEvent({
      payload: { reservationId: '123' },
      integrationId: 'integ-1',
      integrationSecret: 'secreto',
      eventId: 'evt-1',
    });

    const expected = `sha256=${createHmac('sha256', 'secreto').update(`${result.headers['X-Conduit-Timestamp']}.${result.rawBody}`).digest('hex')}`;
    expect(result.headers['X-Conduit-Signature']).toBe(expected);
  });

  it('incluye todos los headers requeridos por la especificación', () => {
    const result = signConduitEvent({
      payload: { a: 1 },
      integrationId: 'integ-1',
      integrationSecret: 'secreto',
      eventId: 'evt-1',
    });
    expect(result.headers['X-Conduit-Integration-Id']).toBe('integ-1');
    expect(result.headers['X-Conduit-Event-Id']).toBe('evt-1');
    expect(result.headers['Content-Type']).toBe('application/json');
  });
});
