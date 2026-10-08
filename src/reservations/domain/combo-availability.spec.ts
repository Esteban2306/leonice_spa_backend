import { findComboStarts, orderComboSegments } from './combo-availability';

const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 11, 9, hour + 5, minute)).toISOString();

describe('findComboStarts', () => {
  it('un solo servicio devuelve sus horarios desde el mínimo permitido', () => {
    expect(
      findComboStarts(
        [{ durationMinutes: 60, slotIsos: [at(8), at(9), at(10)] }],
        new Date(at(9)),
      ),
    ).toEqual([at(9), at(10)]);
  });

  it('el combo solo cabe si cada servicio siguiente empieza donde termina el anterior', () => {
    const starts = findComboStarts(
      [
        { durationMinutes: 60, slotIsos: [at(8), at(9), at(10)] },
        { durationMinutes: 30, slotIsos: [at(9), at(11, 30)] },
      ],
      new Date(at(0)),
    );
    expect(starts).toEqual([at(8)]);
  });

  it('sin horarios del segundo servicio el día no tiene combo', () => {
    expect(
      findComboStarts(
        [
          { durationMinutes: 60, slotIsos: [at(8)] },
          { durationMinutes: 30, slotIsos: [] },
        ],
        new Date(at(0)),
      ),
    ).toEqual([]);
  });
});

describe('orderComboSegments', () => {
  it('el servicio de la categoría principal va primero, como al crear la reserva', () => {
    expect(
      orderComboSegments([
        { id: 'a', isPrincipal: false },
        { id: 'b', isPrincipal: true },
      ]).map((t) => t.id),
    ).toEqual(['b', 'a']);
  });
});
