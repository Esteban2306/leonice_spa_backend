import { ConduitBookingToolsController } from './conduit-booking-tools.controller';

function build(days: unknown[]) {
  const issue = jest.fn((id: string) =>
    Promise.resolve({
      reservationId: id,
      url: `https://spa.test/cancelar/${id}`,
      expiresAt: new Date('2026-11-02T04:59:59Z'),
      sent: false,
    }),
  );

  const controller = new ConduitBookingToolsController(
    {} as never,
    {} as never,
    {} as never,
    { listUpcomingByPhone: jest.fn(() => Promise.resolve({ days })) } as never,
    {} as never,
    {} as never,
    { issue } as never,
  );
  return { controller, issue };
}

describe('GET conduit/booking/reservations/cancellation-link', () => {
  it('sin citas futuras no emite ningún enlace', async () => {
    const { controller, issue } = build([]);
    const result = await controller.cancellationLink({} as never, '573001');
    expect(result).toEqual({ hasUpcoming: false });
    expect(issue).not.toHaveBeenCalled();
  });

  it('emite el enlace de la próxima cita sin enviarlo por su cuenta', async () => {
    const { controller, issue } = build([
      {
        date: '2026-11-02',
        reservations: [
          {
            reservationId: 'r1',
            treatment: 'Masaje',
            scheduledStart: new Date('2026-11-02T15:00:00Z'),
          },
          {
            reservationId: 'r2',
            treatment: 'Facial',
            scheduledStart: new Date('2026-11-02T16:00:00Z'),
          },
        ],
      },
      { date: '2026-11-09', reservations: [{ reservationId: 'r3' }] },
    ]);
    const result = await controller.cancellationLink({} as never, '573001');
    expect(issue).toHaveBeenCalledWith('r1', { send: false });
    expect(result).toMatchObject({
      hasUpcoming: true,
      url: 'https://spa.test/cancelar/r1',
      treatment: 'Masaje',
      sameDayCount: 2,
      upcomingDays: 2,
    });
  });
});
