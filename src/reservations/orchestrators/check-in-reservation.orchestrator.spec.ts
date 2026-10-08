import { ReservationStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { DepositCreditService } from '../service/deposit-credit.service';
import { CheckInReservationOrchestrator } from './check-in-reservation.orchestrator';

const APPOINTMENT = new Date(2026, 11, 9, 9, 0);

const build = (status: ReservationStatus, committed = false) => {
  const updates: ReservationStatus[] = [];
  let current = { id: 'r1', status, scheduledStart: APPOINTMENT };
  const repository = {
    findById: () => Promise.resolve(current),
    updateStatusIfCurrent: (
      _id: string,
      _from: ReservationStatus,
      data: { status: ReservationStatus },
    ) => {
      updates.push(data.status);
      current = { ...current, status: data.status };
      return Promise.resolve(true);
    },
  };
  const credit = {
    isDepositCommittedElsewhere: () => Promise.resolve(committed),
  };
  const orchestrator = new CheckInReservationOrchestrator(
    repository as unknown as ReservationsRepository,
    credit as unknown as DepositCreditService,
  );
  return { orchestrator, updates };
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof AppException
      ? (error.getResponse() as { code: string }).code
      : (error as Error).name;
  }
};

describe('CheckInReservationOrchestrator', () => {
  it('hace check-in el mismo día de la cita', async () => {
    const { orchestrator, updates } = build(ReservationStatus.CONFIRMADA);
    const result = await orchestrator.execute(
      'r1',
      new Date(2026, 11, 9, 8, 50),
    );
    expect(result.status).toBe(ReservationStatus.CITA_EN_CURSO);
    expect(updates).toEqual([ReservationStatus.CITA_EN_CURSO]);
  });

  it('rechaza el check-in de una cita de otro día', async () => {
    const { orchestrator, updates } = build(ReservationStatus.CONFIRMADA);
    expect(
      await codeOf(orchestrator.execute('r1', new Date(2026, 11, 8, 18, 0))),
    ).toBe('RESERVATION_CHECK_IN_NOT_TODAY');
    expect(updates).toEqual([]);
  });

  it('usa el día calendario de Bogotá: 23:30 del día anterior no cuenta', async () => {
    const { orchestrator } = build(ReservationStatus.CONFIRMADA);
    expect(
      await codeOf(orchestrator.execute('r1', new Date(2026, 11, 8, 23, 30))),
    ).toBe('RESERVATION_CHECK_IN_NOT_TODAY');
  });

  it('es idempotente: repetir el check-in devuelve la reserva sin escribir', async () => {
    const { orchestrator, updates } = build(ReservationStatus.CITA_EN_CURSO);
    const result = await orchestrator.execute('r1', new Date(2026, 11, 20));
    expect(result.status).toBe(ReservationStatus.CITA_EN_CURSO);
    expect(updates).toEqual([]);
  });

  it('una reserva sin depósito confirmado no puede hacer check-in', async () => {
    const { orchestrator } = build(ReservationStatus.PENDIENTE_DEPOSITO);
    expect(
      await codeOf(orchestrator.execute('r1', new Date(2026, 11, 9, 9, 0))),
    ).not.toBeNull();
  });
});
