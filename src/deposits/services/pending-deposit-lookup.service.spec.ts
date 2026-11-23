import { PendingDepositLookupService } from './pending-deposit-lookup.service';

const NOW = new Date('2026-11-23T15:00:00.000Z');

const reservation = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  treatment: { name: 'Alisado' },
  scheduledStart: new Date('2026-11-28T12:00:00.000Z'),
  depositExpiresAt: new Date('2026-11-23T17:00:00.000Z'),
  finalPrice: { toString: () => '250' },
  ...overrides,
});

function build(pending: unknown[], released: unknown = null) {
  const prisma = {
    client: {
      reservation: {
        findMany: jest.fn().mockResolvedValue(pending),
        findFirst: jest.fn().mockResolvedValue(released),
      },
    },
  };
  const service = new PendingDepositLookupService(
    {
      findByPhone: jest.fn().mockResolvedValue({ id: 'c1', name: 'Laura' }),
    } as never,
    prisma as never,
  );
  return { service, prisma };
}

describe('anticipos pendientes de la clienta', () => {
  it('el abono es para la cita más reciente que espera anticipo, con su día y su plazo en hora de Bogotá', async () => {
    const { service, prisma } = build([
      reservation('reciente'),
      reservation('anterior'),
    ]);
    const out = await service.findCandidates('+573001112233', NOW);
    expect(prisma.client.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(out.candidates[0]).toMatchObject({
      reservationId: 'reciente',
      forThisDeposit: true,
      appointment: expect.stringContaining('28 de noviembre') as unknown,
      depositDueBy: expect.stringContaining('23 de noviembre') as unknown,
    });
    expect(out.candidates[1].forThisDeposit).toBe(false);
    expect(out.releasedForMissingDeposit).toBeNull();
  });

  it('sin citas pendientes cuenta cuál se liberó por falta de anticipo', async () => {
    const { service } = build(
      [],
      reservation('liberada', {
        cancelledAt: new Date('2026-11-22T18:00:00.000Z'),
      }),
    );
    const out = await service.findCandidates('+573001112233', NOW);
    expect(out.releasedForMissingDeposit).toMatchObject({
      reservationId: 'liberada',
      treatmentName: 'Alisado',
    });
  });

  it('un comprobante sin cita indicada va a la cita más reciente, aunque haya varias', async () => {
    const { service } = build([reservation('reciente'), reservation('vieja')]);
    await expect(service.resolveSingle('+573001112233')).resolves.toBe(
      'reciente',
    );
  });
});
