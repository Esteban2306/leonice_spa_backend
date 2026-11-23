import {
  ASSESSMENT_CHOICE,
  ConduitBookingToolsController,
} from './conduit-booking-tools.controller';

function build(quotes: Array<{ treatmentId: string }> = []) {
  const controller = new ConduitBookingToolsController(
    {
      findAll: jest.fn(() =>
        Promise.resolve([
          { id: 'alisado', requiresPriorAssessment: true },
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
