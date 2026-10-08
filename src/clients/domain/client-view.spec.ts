import { Client, Prisma, ReservationStatus } from '@prisma/client';
import {
  computeReservationStats,
  toClientReservationSummary,
  toClientView,
} from './client-view';

const client: Client = {
  id: 'c1',
  phone: '+573001234567',
  name: 'Ana Pérez',
  birthDate: new Date('1995-03-15T00:00:00.000Z'),
  allergies: null,
  isPregnant: false,
  creditBalance: new Prisma.Decimal(0),
  createdAt: new Date('2026-01-01T15:00:00.000Z'),
  updatedAt: new Date('2026-01-01T15:00:00.000Z'),
  hairColor: null,
  hairLength: null,
  hairProfileUpdatedAt: null,
  whatsappJid: null,
};

describe('toClientView', () => {
  it('expone la fecha de nacimiento como fecha de calendario, sin corrimiento', () => {
    expect(toClientView(client).birthDate).toBe('1995-03-15');
  });

  it('no expone campos internos como creditBalance', () => {
    expect(toClientView(client)).not.toHaveProperty('creditBalance');
  });
});

describe('computeReservationStats', () => {
  it('agrega por estado y suma el total', () => {
    expect(
      computeReservationStats(
        [
          { status: ReservationStatus.COMPLETADA, count: 3 },
          { status: ReservationStatus.CANCELADA, count: 2 },
          { status: ReservationStatus.NO_SHOW, count: 1 },
          { status: ReservationStatus.CONFIRMADA, count: 1 },
        ],
        1,
      ),
    ).toEqual({ total: 7, completed: 3, cancelled: 2, noShow: 1, upcoming: 1 });
  });
});

describe('toClientReservationSummary', () => {
  it('aplana tratamiento y categoría y convierte el precio a número', () => {
    const start = new Date('2026-12-09T13:00:00.000Z');
    expect(
      toClientReservationSummary({
        id: 'r1',
        status: ReservationStatus.CONFIRMADA,
        scheduledStart: start,
        scheduledEnd: start,
        finalPrice: new Prisma.Decimal('85000.00'),
        comboGroupId: null,
        cancellationSource: null,
        treatment: { name: 'Pedespa' },
        category: { name: 'Uñas' },
      }),
    ).toMatchObject({
      reservationId: 'r1',
      treatment: 'Pedespa',
      category: 'Uñas',
      finalPrice: 85000,
    });
  });
});
