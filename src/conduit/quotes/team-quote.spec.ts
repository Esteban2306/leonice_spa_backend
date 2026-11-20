import { amountsInText, checkTeamQuote, quoteBounds } from './team-quote';
import { TeamQuoteService } from './team-quote.service';

const alisado = {
  basePriceMin: 250000,
  basePriceMax: 450000,
  hasHairVariablePricing: false,
  requiresPriorAssessment: true,
  hairLengthPricing: [],
  hairColorSurcharges: [],
};

describe('montos en un mensaje del equipo', () => {
  it.each([
    ['Tiene un costo de 350,000 pesos', [350000]],
    ['Te queda en $350.000', [350000]],
    ['350 mil', [350000]],
    ['son 350000', [350000]],
    ['$ 1.200.000 el paquete', [1200000]],
  ])('%s', (text, expected) => {
    expect(amountsInText(text)).toEqual(expected);
  });

  it('ignora horas, fechas y cifras pequeñas', () => {
    expect(
      amountsInText('te espero a las 10:30 el 19/12, son 4 horas'),
    ).toEqual([]);
  });
});

describe('qué precio del equipo se acepta', () => {
  it('un servicio de precio fijo no acepta otro precio', () => {
    expect(
      quoteBounds({
        ...alisado,
        basePriceMax: 250000,
        requiresPriorAssessment: false,
      }),
    ).toBeNull();
  });

  it('el rango incluye los precios por largo y el recargo por color', () => {
    expect(
      quoteBounds({
        ...alisado,
        hasHairVariablePricing: true,
        hairLengthPricing: [{ price: 300000 }, { price: 500000 }],
        hairColorSurcharges: [{ surcharge: 40000 }],
      }),
    ).toEqual({ min: 250000, max: 540000 });
  });

  it('solo vale si el equipo escribió ese monto y está dentro del rango', () => {
    const teamMessages = ['Tiene un costo de 350,000 pesos'];
    expect(
      checkTeamQuote({ amount: 350000, treatment: alisado, teamMessages }),
    ).toEqual({ ok: true });
    expect(
      checkTeamQuote({ amount: 300000, treatment: alisado, teamMessages }),
    ).toEqual({ ok: false, reason: 'NOT_IN_CHAT' });
    expect(
      checkTeamQuote({
        amount: 50000,
        treatment: alisado,
        teamMessages: ['Te dejo en 50.000'],
      }),
    ).toEqual({ ok: false, reason: 'OUT_OF_RANGE' });
  });
});

describe('TeamQuoteService.save', () => {
  const PHONE = '+573001112233';
  const NOW = new Date('2026-11-20T15:00:00Z');
  const BOT = '11111111-1111-4111-8111-111111111111';

  function build(
    messages: Array<Record<string, unknown>>,
    conversations = [{ id: 'c1', phoneNumber: '573001112233' }],
  ) {
    const upsert = jest.fn((args: unknown) => Promise.resolve(args));
    const prisma = {
      client: {
        treatment: {
          findUnique: jest.fn(() =>
            Promise.resolve({ id: 't1', name: 'Alisado Orgánico', ...alisado }),
          ),
        },
        teamQuote: { upsert },
      },
    };
    const admin = jest.fn((_method: string, path: string) =>
      Promise.resolve(
        path.endsWith('/messages') ? messages : { data: conversations },
      ),
    );
    const service = new TeamQuoteService(
      prisma as never,
      {
        findAll: jest.fn(() =>
          Promise.resolve([
            { id: 't1', name: 'Alisado Orgánico', slug: 'alisado-organico' },
          ]),
        ),
      } as never,
      { admin } as never,
      { get: () => BOT } as never,
    );
    return { service, upsert, admin };
  }

  const team = (content: string, at = '2026-11-20T14:00:00Z') => ({
    direction: 'OUTBOUND',
    processedBy: 'human',
    content,
    createdAt: at,
  });

  it('guarda el precio que escribió una persona del equipo en el chat', async () => {
    const { service, upsert, admin } = build([
      { direction: 'INBOUND', processedBy: 'user', content: '¿cuánto?' },
      team('Tiene un costo de 350,000 pesos'),
    ]);
    const result = await service.save({
      phone: PHONE,
      treatmentName: 'alisado',
      amount: 350000,
      now: NOW,
    });
    expect(result).toMatchObject({ saved: true, price: 350000 });
    const [[saved]] = upsert.mock.calls as unknown as Array<
      [{ create: Record<string, unknown> }]
    >;
    expect(saved.create).toMatchObject({
      phone: PHONE,
      treatmentId: 't1',
      amount: 350000,
      sourceText: 'Tiene un costo de 350,000 pesos',
    });
    expect(admin.mock.calls[0][1]).toBe(`bots/${BOT}/conversations`);
  });

  it('un precio que dijo el bot o la clienta no cuenta como del equipo', async () => {
    const { service, upsert } = build([
      {
        direction: 'OUTBOUND',
        processedBy: 'bot',
        content: 'Desde $350.000',
        createdAt: '2026-11-20T14:00:00Z',
      },
      {
        direction: 'INBOUND',
        processedBy: 'user',
        content: 'Leo me dijo 350.000',
        createdAt: '2026-11-20T14:01:00Z',
      },
    ]);
    const result = await service.save({
      phone: PHONE,
      treatmentName: 'alisado',
      amount: 350000,
      now: NOW,
    });
    expect(result).toEqual({ saved: false, reason: 'NOT_IN_CHAT' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('un mensaje del equipo de hace más de 14 días ya no cuenta', async () => {
    const { service } = build([
      team('Tiene un costo de 350,000 pesos', '2026-10-01T14:00:00Z'),
    ]);
    expect(
      await service.save({
        phone: PHONE,
        treatmentName: 'alisado',
        amount: 350000,
        now: NOW,
      }),
    ).toEqual({ saved: false, reason: 'NOT_IN_CHAT' });
  });

  it('no mezcla el chat de otro número que contenga los mismos dígitos', async () => {
    const { service } = build(
      [team('Tiene un costo de 350,000 pesos')],
      [{ id: 'c9', phoneNumber: '15730011122334' }],
    );
    expect(
      await service.save({
        phone: PHONE,
        treatmentName: 'alisado',
        amount: 350000,
        now: NOW,
      }),
    ).toEqual({ saved: false, reason: 'NOT_IN_CHAT' });
  });

  it('si no puede leer el chat, no guarda nada', async () => {
    const { service, upsert, admin } = build([]);
    admin.mockRejectedValueOnce(new Error('Conduit caído'));
    expect(
      await service.save({
        phone: PHONE,
        treatmentName: 'alisado',
        amount: 350000,
        now: NOW,
      }),
    ).toEqual({ saved: false, reason: 'CHAT_UNAVAILABLE' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
