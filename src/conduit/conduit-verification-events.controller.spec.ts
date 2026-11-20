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
  const handoffs = { request: jest.fn().mockResolvedValue(true) };
  return {
    alerts,
    handoffs,
    controller: new ConduitVerificationEventsController(
      alerts as never,
      handoffs as never,
    ),
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

describe('foto del cabello', () => {
  it('avisa al equipo que debe atender el chat, una vez por foto', async () => {
    const { controller, handoffs, alerts } = build();
    const out = await controller.receive(
      event({
        capability: 'foto-cabello',
        verdict: 'VALID',
        verificationId: 'v9',
        humanSummary: 'Imagen legible y sin reglas configuradas.',
        variables: {
          es_cabello: true,
          descripcion: 'Largo, castaño, ondulado, parece tinturado.',
          senales: 'frizz y puntas abiertas',
        },
        reasonCodes: [],
      }),
      'evt-9',
    );
    expect(out).toEqual({ received: true, teamNotified: true });
    expect(handoffs.request).toHaveBeenCalledWith({
      phone: '+573001112233',
      lid: null,
      reason:
        'Te envió una foto de su cabello para que la examines: búscala en el chat y atiéndela por ahí.',
      summary:
        'Vista previa automática, por confirmar al ver la foto. Se ve: Largo, castaño, ondulado, parece tinturado. Se nota: frizz y puntas abiertas.',
      requestId: 'foto-cabello-v9',
      target: 'TEAM',
      kind: 'HAIR_PHOTO',
    });
    expect(alerts.invalid).not.toHaveBeenCalled();
  });

  it('sin descripción el aviso pide revisar la foto en el chat', async () => {
    const { controller, handoffs } = build();
    await controller.receive(
      event({ capability: 'foto-cabello', verdict: 'VALID', variables: {} }),
      'evt-14',
    );
    expect(handoffs.request).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Sin vista previa: revisa la foto en el chat.',
      }),
    );
  });

  it('una foto dudosa también se pasa al equipo', async () => {
    const { controller, handoffs } = build();
    await controller.receive(
      event({ capability: 'foto-cabello', verdict: 'NEEDS_REVIEW' }),
      'evt-10',
    );
    expect(handoffs.request).toHaveBeenCalledTimes(1);
  });

  it.each(['NOT_APPLICABLE', 'UNREADABLE', 'ERROR', 'INVALID'])(
    'con %s no avisa',
    async (verdict) => {
      const { controller, handoffs } = build();
      const out = await controller.receive(
        event({ capability: 'foto-cabello', verdict }),
        'evt-11',
      );
      expect(out).toMatchObject({ ignored: true });
      expect(handoffs.request).not.toHaveBeenCalled();
    },
  );

  it('un evento repetido de Conduit no avisa dos veces', async () => {
    const { controller, handoffs } = build(true);
    const out = await controller.receive(
      event({ capability: 'foto-cabello', verdict: 'VALID' }),
      'evt-12',
    );
    expect(out).toMatchObject({ duplicate: true });
    expect(handoffs.request).not.toHaveBeenCalled();
  });

  it('un contacto LID se avisa sin teléfono', async () => {
    const { controller, handoffs } = build();
    await controller.receive(
      event({
        capability: 'foto-cabello',
        verdict: 'VALID',
        contact: '123456789@lid',
      }),
      'evt-13',
    );
    expect(handoffs.request).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, lid: '123456789@lid' }),
    );
  });
});
