import { ReservationStatus } from '@prisma/client';
import {
  ScheduleReminderListener,
  reminderJobId,
} from './schedule-reminder.listener';

const DAY = 24 * 60 * 60 * 1000;

function setup(previousJob?: { active: boolean }) {
  const removed: string[] = [];
  const queue = {
    getJob: jest.fn().mockResolvedValue(
      previousJob && {
        isActive: jest.fn().mockResolvedValue(previousJob.active),
        remove: jest.fn(() => {
          removed.push('previous');
          return Promise.resolve();
        }),
      },
    ),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    client: {
      reservation: {
        findUnique: jest.fn().mockResolvedValue({
          treatmentId: 't1',
          categoryId: 'c1',
          status: ReservationStatus.CONFIRMADA,
        }),
      },
      automationRule: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  };
  const listener = new ScheduleReminderListener(
    prisma as never,
    queue as never,
  );
  return { listener, queue, removed };
}

const confirmed = (reservationId: string, scheduledStart: Date) =>
  ({ payload: { reservationId, scheduledStart } }) as never;

describe('ScheduleReminderListener', () => {
  it('programa el recordatorio un día antes con id estable y la fecha de la cita', async () => {
    const { listener, queue } = setup();
    const start = new Date(Date.now() + 3 * DAY);

    await listener.handleReservationConfirmed(confirmed('r1', start));

    const [, data, options] = queue.add.mock.calls[0] as [
      string,
      unknown,
      { jobId: string; delay: number },
    ];
    expect(data).toEqual({
      reservationId: 'r1',
      scheduledStart: start.toISOString(),
    });
    expect(options.jobId).toBe(reminderJobId('r1'));
    expect(options.delay).toBeGreaterThan(2 * DAY - 5000);
    expect(options.delay).toBeLessThanOrEqual(2 * DAY);
  });

  it('al reagendar reemplaza el recordatorio pendiente de la fecha anterior', async () => {
    const { listener, queue, removed } = setup({ active: false });
    const start = new Date(Date.now() + 10 * DAY);

    await listener.handleRescheduledByAdmin({
      payload: { reservationId: 'r1', newScheduledStart: start },
    } as never);

    expect(removed).toEqual(['previous']);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('si la nueva fecha ya no deja margen, quita el anterior y no programa otro', async () => {
    const { listener, queue, removed } = setup({ active: false });

    await listener.handleRescheduledByAdmin({
      payload: {
        reservationId: 'r1',
        newScheduledStart: new Date(Date.now() + DAY / 2),
      },
    } as never);

    expect(removed).toEqual(['previous']);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('no toca un recordatorio que se está enviando en este momento', async () => {
    const { listener, removed } = setup({ active: true });

    await listener.handleReservationConfirmed(
      confirmed('r1', new Date(Date.now() + 3 * DAY)),
    );

    expect(removed).toEqual([]);
  });
});
