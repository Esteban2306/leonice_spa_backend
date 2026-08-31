import {
  groupReservationsForDisplay,
  isEffectivelyConsecutive,
} from './group-reservations-for-display';

interface FakeReservation {
  id: string;
  clientId: string;
  comboGroupId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  status: string;
  finalPrice: { toString: () => string };
  client: { id: string; name: string; phone: string };
  treatment: { id: string; name: string };
  category: { id: string; name: string };
}

function fakeReservation(overrides: Partial<FakeReservation>): FakeReservation {
  return {
    id: overrides.id ?? 'default-id',
    clientId: overrides.clientId ?? 'client-1',
    comboGroupId: overrides.comboGroupId ?? null,
    scheduledStart: overrides.scheduledStart ?? new Date(),
    scheduledEnd: overrides.scheduledEnd ?? new Date(),
    status: 'CONFIRMADA',
    finalPrice: { toString: () => '100' },
    client: {
      id: overrides.clientId ?? 'client-1',
      name: 'Test',
      phone: '123',
    },
    treatment: { id: 't1', name: 'Tratamiento' },
    category: { id: 'c1', name: 'Categoría' },
  };
}

describe('isEffectivelyConsecutive', () => {
  it('true si son exactamente consecutivas', () => {
    expect(
      isEffectivelyConsecutive(
        new Date('2026-01-01T10:00:00'),
        new Date('2026-01-01T10:00:00'),
      ),
    ).toBe(true);
  });

  it('true si el hueco es solo el almuerzo (el caso real de "Combo3")', () => {
    // 12pm a 2pm local, en un miércoles cualquiera
    expect(
      isEffectivelyConsecutive(
        new Date('2026-09-16T12:00:00'),
        new Date('2026-09-16T14:00:00'),
      ),
    ).toBe(true);
  });

  it('false si hubo horario operativo real dentro del hueco', () => {
    expect(
      isEffectivelyConsecutive(
        new Date('2026-09-16T09:00:00'),
        new Date('2026-09-16T11:00:00'),
      ),
    ).toBe(false);
  });

  it('false si el hueco cruza a otro día calendario', () => {
    expect(
      isEffectivelyConsecutive(
        new Date('2026-09-16T16:00:00'),
        new Date('2026-09-17T08:00:00'),
      ),
    ).toBe(false);
  });
});

describe('groupReservationsForDisplay', () => {
  it('agrupa por comboGroupId explícito', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        comboGroupId: 'g1',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T10:00'),
      }),
      fakeReservation({
        id: '2',
        comboGroupId: 'g1',
        scheduledStart: new Date('2026-01-01T10:00'),
        scheduledEnd: new Date('2026-01-01T11:00'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].isCombo).toBe(true);
  });

  it('agrupa reservas separadas por el almuerzo, sin comboGroupId (el bug de hoy)', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        scheduledStart: new Date('2026-09-16T08:00:00'),
        scheduledEnd: new Date('2026-09-16T12:00:00'),
      }),
      fakeReservation({
        id: '2',
        scheduledStart: new Date('2026-09-16T14:00:00'),
        scheduledEnd: new Date('2026-09-16T15:00:00'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].isCombo).toBe(true);
  });

  it('NO agrupa si hubo horario abierto real entre las dos', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        scheduledStart: new Date('2026-09-16T08:00:00'),
        scheduledEnd: new Date('2026-09-16T09:00:00'),
      }),
      fakeReservation({
        id: '2',
        scheduledStart: new Date('2026-09-16T11:00:00'),
        scheduledEnd: new Date('2026-09-16T12:00:00'),
      }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((g) => !g.isCombo)).toBe(true);
  });

  it('NO agrupa clientes distintos aunque el horario encaje', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        clientId: 'client-1',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T09:00'),
      }),
      fakeReservation({
        id: '2',
        clientId: 'client-2',
        scheduledStart: new Date('2026-01-01T09:00'),
        scheduledEnd: new Date('2026-01-01T10:00'),
      }),
    ]);
    expect(result).toHaveLength(2);
  });
});
