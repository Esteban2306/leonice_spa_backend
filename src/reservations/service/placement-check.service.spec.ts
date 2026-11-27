import { Prisma } from '@prisma/client';
import { PlacementCheckService } from './placement-check.service';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { OperatingScheduleService } from './operating-schedule.service';
import { personKey } from '../domain/person-key';

const at = (hour: number) => new Date(2027, 0, 4, hour);

function evaluate(options: {
  holders: Array<[string, string | null]>;
  takenStarts?: Date[];
}) {
  const availability = {
    getCapacityForCategory: () => Promise.resolve(1),
    findHoldingIntervalsOverlapping: () =>
      Promise.resolve(
        options.holders.map(([clientId, dependentId]) => ({
          scheduledStart: at(9),
          scheduledEnd: at(10),
          personKey: personKey(clientId, dependentId),
        })),
      ),
  };
  const reservations = {
    findActiveStartsForPersonTreatment: () =>
      Promise.resolve(options.takenStarts ?? []),
  };
  const schedule = {
    getWindows: () => Promise.resolve([{ start: at(8), end: at(18) }]),
  };
  const service = new PlacementCheckService(
    availability as unknown as AvailabilityRepository,
    reservations as unknown as ReservationsRepository,
    schedule as unknown as OperatingScheduleService,
  );

  return service.evaluate({} as Prisma.TransactionClient, {
    clientId: 'ana',
    dependentId: null,
    categoryId: 'capilar',
    treatmentId: 'color',
    start: at(9),
    end: at(10),
    now: at(6),
  });
}

describe('PlacementCheckService', () => {
  it('no cuenta el cupo que ya ocupa la misma persona', async () => {
    await expect(evaluate({ holders: [['ana', null]] })).resolves.toEqual({
      ok: true,
    });
  });

  it('sí cuenta el cupo de la persona para quien reservó la clienta', async () => {
    await expect(evaluate({ holders: [['ana', 'sofia']] })).resolves.toEqual({
      ok: false,
      reason: 'NO_CAPACITY',
    });
  });

  it('rechaza el mismo servicio a la misma hora', async () => {
    await expect(
      evaluate({ holders: [['ana', null]], takenStarts: [at(9)] }),
    ).resolves.toEqual({ ok: false, reason: 'DUPLICATE_BOOKING' });
  });
});
