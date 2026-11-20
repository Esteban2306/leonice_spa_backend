import { BadRequestException } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ConduitBookingToolsController } from './conduit-booking-tools.controller';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const CATALOG = [
  { id: ID_A, name: 'Alisado Orgánico', slug: 'alisado-organico' },
  { id: ID_B, name: 'Terapia de hidratación', slug: 'terapia-hidratacion' },
  { id: 'x3', name: 'Terapia de nutrición', slug: 'terapia-nutricion' },
];

function build(
  active: Array<{ id: string; treatmentId: string; price: number }> = [],
) {
  const execute = jest.fn((_dto?: unknown, _opts?: unknown) =>
    Promise.resolve({
      reservations: [{ id: 'res-1', treatmentId: ID_A }],
      summary: '',
      creditAppliedReservationIds: [],
    }),
  );
  const quotes = {
    activeFor: jest.fn((_phone: string) => Promise.resolve(active)),
    markUsed: jest.fn((_used: unknown) => Promise.resolve()),
  };
  const controller = new ConduitBookingToolsController(
    { findAll: jest.fn(() => Promise.resolve(CATALOG)) } as never,
    {} as never,
    { execute } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    quotes as never,
  );
  return { controller, execute, quotes };
}

const base = {
  client: { phone: '573001112233' },
  scheduledStart: '2026-11-02T09:00:00-05:00',
};
const req = { conduitContact: { phone: '573001112233' } } as never;

describe('POST conduit/booking/reservations · precio que dio el equipo', () => {
  const quote = { id: 'q1', treatmentId: ID_A, price: 350000 };

  it('con un precio del equipo vigente para ese servicio, se agenda con ese precio y se marca usado', async () => {
    const { controller, execute, quotes } = build([quote]);
    await controller.create({ ...base, treatments: [ID_A] }, req);
    const options = execute.mock.calls[0][1] as {
      priceOverrides: Map<string, number>;
    };
    expect(options.priceOverrides.get(ID_A)).toBe(350000);
    expect(quotes.activeFor).toHaveBeenCalledWith('573001112233');
    expect(quotes.markUsed).toHaveBeenCalledWith([
      { quoteId: 'q1', reservationId: 'res-1' },
    ]);
  });

  it('un precio del equipo de otro servicio no se aplica', async () => {
    const { controller, execute, quotes } = build([quote]);
    await controller.create({ ...base, treatments: [ID_B] }, req);
    const options = execute.mock.calls[0][1] as {
      priceOverrides: Map<string, number>;
    };
    expect(options.priceOverrides.size).toBe(0);
    expect(quotes.markUsed).toHaveBeenCalledWith([]);
  });

  it('sin teléfono verificado no se buscan precios del equipo', async () => {
    const { controller, execute, quotes } = build([quote]);
    await controller.create({ ...base, treatments: [ID_A] }, {
      conduitContact: { lid: '123@lid' },
    } as never);
    expect(quotes.activeFor).not.toHaveBeenCalled();
    const options = execute.mock.calls[0][1] as {
      priceOverrides: Map<string, number>;
    };
    expect(options.priceOverrides.size).toBe(0);
  });
});

describe('POST conduit/booking/reservations · servicios por nombre', () => {
  it('resuelve el nombre al id sin pedir que la IA consulte la lista', async () => {
    const { controller, execute } = build();
    await controller.create(
      { ...base, treatmentNames: ['alisado orgánico'] },
      req,
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ treatments: [ID_A], channel: 'WHATSAPP' }),
      expect.anything(),
    );
  });

  it('acepta ids, mezcla ids y nombres y no repite', async () => {
    const { controller, execute } = build();
    await controller.create({ ...base, treatments: [ID_A] }, req);
    expect(execute.mock.calls[0][0]).toMatchObject({ treatments: [ID_A] });
    await controller.create(
      {
        ...base,
        treatments: [ID_A],
        treatmentNames: ['Alisado Orgánico', 'hidratación'],
      },
      req,
    );
    expect(execute.mock.calls[1][0]).toMatchObject({
      treatments: [ID_A, ID_B],
    });
  });

  it('un nombre ambiguo o desconocido es un error de negocio que explica qué pasó', async () => {
    const { controller, execute } = build();
    await expect(
      controller.create({ ...base, treatmentNames: ['terapia'] }, req),
    ).rejects.toThrow(/varios.*Terapia de hidratación/);
    await expect(
      controller.create({ ...base, treatmentNames: ['masaje tailandés'] }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.create({ ...base }, req)).rejects.toThrow(
      /treatments/,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  describe('horario no disponible', () => {
    const slotError = () =>
      new AppException('PLACEMENT_NO_SLOT_THAT_DAY', {
        details: { date: '2026-11-02' },
      });

    function withCalendar(days: unknown[]) {
      const execute = jest.fn((_dto?: unknown, _opts?: unknown) =>
        Promise.reject(slotError()),
      );
      const getAvailabilityCalendar = jest.fn(() =>
        Promise.resolve({ treatmentIds: [ID_A], days }),
      );
      const controller = new ConduitBookingToolsController(
        { findAll: jest.fn(() => Promise.resolve(CATALOG)) } as never,
        { getAvailabilityCalendar } as never,
        { execute } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          activeFor: jest.fn(() => Promise.resolve([])),
          markUsed: jest.fn(() => Promise.resolve()),
        } as never,
      );
      return { controller, getAvailabilityCalendar };
    }

    const day = (date: string, times: string[]) => ({
      date,
      available: times.length > 0,
      reason: null,
      slots: times.map((t) => ({
        iso: new Date(`${date}T${t.padStart(5, '0')}:00-05:00`).toISOString(),
        localTime: t,
      })),
    });

    it('el error lleva los próximos horarios libres (máx. 3 días y 4 horas por día, una por hora)', async () => {
      const { controller, getAvailabilityCalendar } = withCalendar([
        day('2026-11-02', []),
        day('2026-11-03', [
          '9:00',
          '9:30',
          '10:00',
          '10:30',
          '11:00',
          '12:00',
          '13:00',
        ]),
        day('2026-11-04', ['8:00']),
        day('2026-11-05', ['2:00']),
        day('2026-11-06', ['3:00']),
      ]);
      const error = await controller
        .create({ ...base, treatments: [ID_A] }, req)
        .catch((e: AppException) => e);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('PLACEMENT_NO_SLOT_THAT_DAY');
      expect((error as AppException).details).toMatchObject({
        date: '2026-11-02',
        alternatives: [
          { date: '2026-11-03', times: ['9:00', '10:00', '11:00', '12:00'] },
          { date: '2026-11-04', times: ['8:00'] },
          { date: '2026-11-05', times: ['2:00'] },
        ],
      });
      expect(getAvailabilityCalendar).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-11-02', to: '2026-11-10' }),
      );
    });

    it('si no hay alternativas o el calendario falla devuelve el error original', async () => {
      const none = withCalendar([day('2026-11-02', [])]);
      const original = await none.controller
        .create({ ...base, treatments: [ID_A] }, req)
        .catch((e: AppException) => e);
      expect((original as AppException).details).toEqual({
        date: '2026-11-02',
      });
    });
  });
});
