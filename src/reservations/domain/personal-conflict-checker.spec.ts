import { overlapsAny, latestConflictEnd } from './personal-conflict-checker';

describe('overlapsAny', () => {
  it('detecta solapamiento real', () => {
    const intervals = [
      {
        start: new Date('2026-01-01T09:00'),
        end: new Date('2026-01-01T10:00'),
      },
    ];
    expect(
      overlapsAny(
        new Date('2026-01-01T09:30'),
        new Date('2026-01-01T10:30'),
        intervals,
      ),
    ).toBe(true);
  });

  it('intervalos consecutivos, sin cruzarse, no cuentan como solapamiento', () => {
    const intervals = [
      {
        start: new Date('2026-01-01T09:00'),
        end: new Date('2026-01-01T10:00'),
      },
    ];
    expect(
      overlapsAny(
        new Date('2026-01-01T10:00'),
        new Date('2026-01-01T11:00'),
        intervals,
      ),
    ).toBe(false);
  });
});

describe('latestConflictEnd', () => {
  it('null si no hay conflicto', () => {
    expect(
      latestConflictEnd(
        new Date('2026-01-01T09:00'),
        new Date('2026-01-01T10:00'),
        [],
      ),
    ).toBeNull();
  });

  it('devuelve el final del conflicto que termina más tarde, entre varios', () => {
    const intervals = [
      {
        start: new Date('2026-01-01T09:00'),
        end: new Date('2026-01-01T09:45'),
      },
      {
        start: new Date('2026-01-01T09:30'),
        end: new Date('2026-01-01T10:30'),
      },
    ];
    expect(
      latestConflictEnd(
        new Date('2026-01-01T09:00'),
        new Date('2026-01-01T10:00'),
        intervals,
      ),
    ).toEqual(new Date('2026-01-01T10:30'));
  });
});
