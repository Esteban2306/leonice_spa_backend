import { DepositStatus, ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from './reservations.repository';
import { PrismaService } from '../../infrastructure/database/prisma.service';

function setup() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    client: { reservation: { findMany } },
  } as unknown as PrismaService;
  return { findMany, repository: new ReservationsRepository(prisma) };
}

describe('ReservationsRepository.findGroupingProjection', () => {
  it('narrows unresolved deposits in the database without dropping the status filter', async () => {
    const { findMany, repository } = setup();

    await repository.findGroupingProjection({
      status: ReservationStatus.CANCELADA,
      unresolvedDepositOnly: true,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ReservationStatus.CANCELADA,
          AND: [
            {
              status: {
                in: [ReservationStatus.NO_SHOW, ReservationStatus.CANCELADA],
              },
            },
            { deposit: { some: { status: DepositStatus.CONFIRMADO } } },
          ],
        },
      }),
    );
  });

  it('adds no deposit condition when the filter is off', async () => {
    const { findMany, repository } = setup();

    await repository.findGroupingProjection({});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
