import {
  ASSESSMENT_CHOICE,
  ConduitBookingToolsController,
  EXPIRED_PROMOTION,
} from './conduit-booking-tools.controller';

function build(quotes: Array<{ treatmentId: string }> = []) {
  const controller = new ConduitBookingToolsController(
    {
      findAll: jest.fn(() =>
        Promise.resolve([
          {
            id: 'alisado',
            requiresPriorAssessment: true,
            activePromotion: { endsAt: new Date('2026-11-25T04:59:59Z') },
          },
          { id: 'masaje', requiresPriorAssessment: false },
        ]),
      ),
    } as never,
    {
      getAvailability: jest.fn(() => Promise.resolve([])),
      getAvailabilityCalendar: jest.fn(() => Promise.resolve({ days: [] })),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { activeFor: jest.fn(() => Promise.resolve(quotes)) } as never,
    {} as never,
    {
      markDay: jest.fn(),
      markRange: jest.fn(),
      assertConsulted: jest.fn(),
    } as never,
  );
  return controller;
}

const withPhone = { conduitContact: { phone: '573108525522' } } as never;

describe('disponibilidad de un servicio que requiere valoración', () => {
  it('le recuerda al bot ofrecer las dos opciones de valoración', async () => {
    const result = await build().getAvailability(
      { treatmentId: 'alisado', date: '2026-12-02' },
      withPhone,
    );
    expect(result.valoracion).toBe(ASSESSMENT_CHOICE);
  });

  it('si la promoción vence antes del día de la cita, le dice al bot que no la mencione', async () => {
    const later = await build().getAvailability(
      { treatmentId: 'alisado', date: '2026-12-03' },
      withPhone,
    );
    expect(later.promocion).toBe(EXPIRED_PROMOTION);
    const within = await build().getAvailability(
      { treatmentId: 'alisado', date: '2026-11-24' },
      withPhone,
    );
    expect(within).not.toHaveProperty('promocion');
  });

  it('no lo dice si el servicio no requiere valoración', async () => {
    const result = await build().getAvailabilityCalendar(
      { treatmentIds: ['masaje'] } as never,
      withPhone,
    );
    expect(result).not.toHaveProperty('valoracion');
  });

  it('no lo dice si el equipo ya le dio su precio para ese servicio', async () => {
    const result = await build([{ treatmentId: 'alisado' }]).getAvailability(
      { treatmentId: 'alisado', date: '2026-12-02' },
      withPhone,
    );
    expect(result).not.toHaveProperty('valoracion');
  });
});
