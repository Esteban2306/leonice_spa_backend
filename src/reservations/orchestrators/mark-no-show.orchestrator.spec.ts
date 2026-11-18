import { ReservationStatus } from '@prisma/client';
import { MarkNoShowOrchestrator } from './mark-no-show.orchestrator';
import type { ReservationsRepository } from '../repositories/reservations.repository';
import type { EventBusService } from '../../common/events/event.service';
import { InvalidTransitionException } from '../../common/exceptions/invalid-transition.exception';

function build(status: ReservationStatus) {
  const updates: Array<{ expected: ReservationStatus; data: unknown }> = [];
  const repository = {
    findById: jest.fn().mockResolvedValue({
      id: 'r1',
      clientId: 'c1',
      status,
      scheduledStart: new Date('2026-11-10T15:00:00Z'),
    }),
    updateStatusIfCurrent: jest.fn(
      (_id: string, expected: ReservationStatus, data: unknown) => {
        updates.push({ expected, data });
        return Promise.resolve(true);
      },
    ),
  };
  const eventBus = { publish: jest.fn() };
  const orchestrator = new MarkNoShowOrchestrator(
    repository as unknown as ReservationsRepository,
    eventBus as unknown as EventBusService,
  );
  return { orchestrator, updates, eventBus };
}

describe('MarkNoShowOrchestrator', () => {
  it.each([
    ReservationStatus.SOLICITUD_INICIADA,
    ReservationStatus.PENDIENTE_VALORACION,
    ReservationStatus.PENDIENTE_DEPOSITO,
    ReservationStatus.CONFIRMADA,
  ])('desde %s pasa a NO_SHOW y guarda el estado anterior', async (status) => {
    const { orchestrator, updates, eventBus } = build(status);

    await orchestrator.execute('r1');

    expect(updates).toEqual([
      {
        expected: status,
        data: { status: ReservationStatus.NO_SHOW, noShowFromStatus: status },
      },
    ]);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it.each([
    ReservationStatus.COMPLETADA,
    ReservationStatus.CANCELADA,
    ReservationStatus.CITA_EN_CURSO,
  ])('desde %s no se permite', async (status) => {
    const { orchestrator, updates } = build(status);

    await expect(orchestrator.execute('r1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
    expect(updates).toEqual([]);
  });
});
