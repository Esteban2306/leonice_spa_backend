import { CancellationSource, ReservationStatus } from '@prisma/client';
import {
  CancellationCandidate,
  planClientCancellation,
} from './client-cancellation';

const at = (hour: number) => new Date(2026, 11, 9, hour, 0);
const NOW = at(7);

const row = (
  id: string,
  hour: number,
  status: ReservationStatus = ReservationStatus.CONFIRMADA,
  cancellationSource: CancellationSource | null = null,
): CancellationCandidate => ({
  id,
  status,
  scheduledStart: at(hour),
  cancellationSource,
});

const ids = (rows: CancellationCandidate[]) => rows.map((r) => r.id);

describe('planClientCancellation — SINGLE', () => {
  it('cancela solo la reserva elegida', () => {
    const plan = planClientCancellation({
      target: row('a', 9),
      sameDay: [row('a', 9), row('b', 10)],
      scope: 'SINGLE',
      now: NOW,
    });
    expect(plan.ok && ids(plan.toCancel)).toEqual(['a']);
  });

  it('es idempotente si el cliente ya la había cancelado', () => {
    const plan = planClientCancellation({
      target: row(
        'a',
        9,
        ReservationStatus.CANCELADA,
        CancellationSource.CLIENT,
      ),
      sameDay: [],
      scope: 'SINGLE',
      now: NOW,
    });
    expect(plan).toMatchObject({ ok: true, toCancel: [] });
    expect(plan.ok && ids(plan.alreadyCancelled)).toEqual(['a']);
  });

  it('no se puede cancelar después de que la cita empezó', () => {
    expect(
      planClientCancellation({
        target: row('a', 9),
        sameDay: [],
        scope: 'SINGLE',
        now: at(9),
      }),
    ).toMatchObject({ ok: false, code: 'RESERVATION_CANCEL_TOO_LATE' });
  });

  it('una reserva cancelada por el admin o por vencimiento no es del cliente', () => {
    expect(
      planClientCancellation({
        target: row(
          'a',
          9,
          ReservationStatus.CANCELADA,
          CancellationSource.ADMIN,
        ),
        sameDay: [],
        scope: 'SINGLE',
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: 'RESERVATION_NOT_CANCELLABLE' });
  });

  it('una cita en curso o completada no se cancela', () => {
    expect(
      planClientCancellation({
        target: row('a', 9, ReservationStatus.CITA_EN_CURSO),
        sameDay: [],
        scope: 'SINGLE',
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: 'RESERVATION_NOT_CANCELLABLE' });
  });
});

describe('planClientCancellation — DAY', () => {
  it('cancela todas las reservas vivas del día y deja las ya cerradas', () => {
    const plan = planClientCancellation({
      target: row('a', 9),
      sameDay: [
        row('a', 9),
        row('b', 10, ReservationStatus.PENDIENTE_DEPOSITO),
        row('c', 14, ReservationStatus.COMPLETADA),
      ],
      scope: 'DAY',
      now: NOW,
    });
    expect(plan.ok && ids(plan.toCancel)).toEqual(['a', 'b']);
  });

  it('a media mañana solo cancela lo que aún no empezó', () => {
    const plan = planClientCancellation({
      target: row('b', 14),
      sameDay: [row('a', 9), row('b', 14)],
      scope: 'DAY',
      now: at(10),
    });
    expect(plan.ok && ids(plan.toCancel)).toEqual(['b']);
  });

  it('repetir la cancelación del día es idempotente', () => {
    const cancelled = (id: string, h: number) =>
      row(id, h, ReservationStatus.CANCELADA, CancellationSource.CLIENT);
    const plan = planClientCancellation({
      target: cancelled('a', 9),
      sameDay: [cancelled('a', 9), cancelled('b', 10)],
      scope: 'DAY',
      now: NOW,
    });
    expect(plan.ok && plan.toCancel).toEqual([]);
    expect(plan.ok && ids(plan.alreadyCancelled)).toEqual(['a', 'b']);
  });

  it('si todo el día ya empezó, informa que es tarde', () => {
    expect(
      planClientCancellation({
        target: row('a', 9),
        sameDay: [row('a', 9)],
        scope: 'DAY',
        now: at(11),
      }),
    ).toMatchObject({ ok: false, code: 'RESERVATION_CANCEL_TOO_LATE' });
  });
});
