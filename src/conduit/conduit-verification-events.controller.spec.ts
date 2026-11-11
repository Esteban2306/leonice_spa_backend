import { ConduitVerificationEventsController } from './conduit-verification-events.controller';
import type { ConduitVerificationEventDto } from './dto/conduit-verification-event.dto';

function event(
  data: Partial<ConduitVerificationEventDto['data']> = {},
): ConduitVerificationEventDto {
  return {
    event: 'verification.invalid',
    timestamp: '2026-11-10T12:00:00.000Z',
    data: {
      verificationId: 'v1',
      conversationId: 'c1',
      capability: 'image-analysis',
      verdict: 'INVALID',
      contact: '573001112233',
      reasonCodes: ['AMOUNT_GTE_FAILED'],
      ...data,
    },
  };
}

function build(seen = false) {
  const alerts = {
    alreadySeen: jest.fn().mockResolvedValue(seen),
    valid: jest.fn().mockResolvedValue(undefined),
    invalid: jest.fn().mockResolvedValue(1),
    review: jest.fn().mockResolvedValue(undefined),
  };
  return {
    alerts,
    controller: new ConduitVerificationEventsController(alerts as never),
  };
}

describe('ConduitVerificationEventsController', () => {
  it('INVALID suma un rechazo con sus motivos', async () => {
    const { controller, alerts } = build();

    await controller.receive(event(), 'evt-1');

    expect(alerts.invalid).toHaveBeenCalledWith(
      { phone: '+573001112233', key: '573001112233' },
      'v1',
      ['AMOUNT_GTE_FAILED'],
    );
  });

  it('VALID corta la racha', async () => {
    const { controller, alerts } = build();

    await controller.receive(event({ verdict: 'VALID' }), 'evt-1');

    expect(alerts.valid).toHaveBeenCalledTimes(1);
    expect(alerts.invalid).not.toHaveBeenCalled();
  });

  it('NEEDS_REVIEW avisa al equipo', async () => {
    const { controller, alerts } = build();

    await controller.receive(
      event({ verdict: 'NEEDS_REVIEW', reasonCodes: ['DESTINATION_MISSING'] }),
      'evt-1',
    );

    expect(alerts.review).toHaveBeenCalledWith(
      { phone: '+573001112233', key: '573001112233' },
      'v1',
      ['DESTINATION_MISSING'],
    );
  });

  it.each(['ERROR', 'UNREADABLE', 'NOT_APPLICABLE'])(
    '%s no cuenta ni avisa',
    async (verdict) => {
      const { controller, alerts } = build();

      await controller.receive(event({ verdict }), 'evt-1');

      expect(alerts.invalid).not.toHaveBeenCalled();
      expect(alerts.review).not.toHaveBeenCalled();
      expect(alerts.valid).not.toHaveBeenCalled();
    },
  );

  it('ignora otras capacidades', async () => {
    const { controller, alerts } = build();

    const result = await controller.receive(
      event({ capability: 'otra' }),
      'evt-1',
    );

    expect(result).toEqual({ received: true, ignored: true });
    expect(alerts.invalid).not.toHaveBeenCalled();
  });

  it('ignora un aviso sin contacto', async () => {
    const { controller, alerts } = build();

    const result = await controller.receive(event({ contact: null }), 'evt-1');

    expect(result).toEqual({ received: true, ignored: true });
    expect(alerts.invalid).not.toHaveBeenCalled();
  });

  it('una entrega repetida no vuelve a contar', async () => {
    const { controller, alerts } = build(true);

    const result = await controller.receive(event(), 'evt-1');

    expect(result).toEqual({ received: true, duplicate: true });
    expect(alerts.invalid).not.toHaveBeenCalled();
  });
});
