import { ReservationStatus } from '@prisma/client';
import { buildDailyReport, type ScheduledReservationRow } from './daily-report';

const nails = { id: 'cat-nails', name: 'Uñas' };
const hair = { id: 'cat-hair', name: 'Spa Capilar' };
const tradicional = { id: 't-trad', name: 'Tradicional' };
const alisado = { id: 't-alis', name: 'Alisado' };

function row(
  status: ReservationStatus,
  overrides: Partial<ScheduledReservationRow> = {},
): ScheduledReservationRow {
  return {
    status,
    cancellationSource: null,
    finalPrice: '35.00',
    treatment: tradicional,
    category: nails,
    ...overrides,
  };
}

describe('buildDailyReport', () => {
  const report = buildDailyReport({
    dayKey: '2026-10-08',
    todayKey: '2026-10-09',
    scheduled: [
      row(ReservationStatus.COMPLETADA),
      row(ReservationStatus.COMPLETADA, {
        finalPrice: '380.00',
        treatment: alisado,
        category: hair,
      }),
      row(ReservationStatus.NO_SHOW),
      row(ReservationStatus.CANCELADA, { cancellationSource: 'TIMEOUT' }),
      row(ReservationStatus.CANCELADA, { cancellationSource: 'CLIENT' }),
      row(ReservationStatus.CONFIRMADA),
    ],
    created: [
      { channel: 'WHATSAPP' },
      { channel: 'WHATSAPP' },
      { channel: 'WEB' },
    ],
    reviewedDeposits: [
      { status: 'CONFIRMADO', amount: '50.00' },
      { status: 'CONVERTIDO_A_CREDITO', amount: '30.00' },
      { status: 'RECHAZADO', amount: null },
    ],
    newClients: 2,
    today: [
      {
        status: ReservationStatus.CONFIRMADA,
        scheduledStart: new Date('2026-10-09T19:00:00Z'),
        assessment: {
          state: 'PENDING',
          reason: 'REQUIRES_ASSESSMENT',
          hairProfileStatus: 'MISSING',
        },
      },
      {
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        scheduledStart: new Date('2026-10-09T13:00:00Z'),
        assessment: {
          state: 'NOT_REQUIRED',
          reason: null,
          hairProfileStatus: 'MISSING',
        },
      },
      {
        status: ReservationStatus.CANCELADA,
        scheduledStart: new Date('2026-10-09T12:00:00Z'),
        assessment: {
          state: 'NOT_REQUIRED',
          reason: null,
          hairProfileStatus: 'MISSING',
        },
      },
    ],
    pendingDeposits: 4,
    hairProfilesToRenew: 3,
  });

  it('resume las citas del día por resultado', () => {
    expect(report.appointments).toEqual({
      scheduled: 6,
      completed: 2,
      noShow: 1,
      rescheduled: 0,
      cancelled: 2,
      cancelledBy: { CLIENT: 1, ADMIN: 0, TIMEOUT: 1 },
      leftOpen: 1,
    });
  });

  it('suma lo realizado y los anticipos revisados, en miles de COP', () => {
    expect(report.revenue).toEqual({
      completedServices: '415.00',
      depositsApproved: { count: 2, amount: '80.00' },
      depositsRejected: 1,
    });
  });

  it('cuenta reservas nuevas por canal', () => {
    expect(report.bookings).toEqual({
      created: 3,
      byChannel: { WHATSAPP: 2, WEB: 1 },
    });
  });

  it('ordena servicios y categorías sin contar cancelaciones', () => {
    expect(report.topTreatments[0]).toEqual({
      treatmentId: 't-trad',
      name: 'Tradicional',
      category: 'Uñas',
      count: 3,
    });
    expect(
      report.categories.map((c) => [c.name, c.scheduled, c.completed]),
    ).toEqual([
      ['Uñas', 3, 1],
      ['Spa Capilar', 1, 1],
    ]);
  });

  it('anticipa el día de hoy', () => {
    expect(report.today).toEqual({
      date: '2026-10-09',
      appointments: 2,
      firstAppointmentAt: new Date('2026-10-09T13:00:00Z'),
      pendingDeposits: 4,
      pendingAssessments: 1,
      hairProfilesToRenew: 3,
    });
  });
});
