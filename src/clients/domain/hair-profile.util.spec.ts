import {
  addCalendarMonths,
  getHairProfileStatus,
  hairProfileExpiryCutoff,
  toHairProfileView,
} from './hair-profile.util';

const local = (y: number, m: number, d: number, h = 10) =>
  new Date(y, m - 1, d, h, 0, 0);

const profile = (updatedAt: Date | null) => ({
  hairLength: 'LARGO' as const,
  hairColor: 'OSCURO' as const,
  hairProfileUpdatedAt: updatedAt,
});

describe('addCalendarMonths', () => {
  it('suma meses de calendario conservando el día', () => {
    expect(addCalendarMonths(local(2026, 6, 15), 4)).toEqual(
      local(2026, 10, 15),
    );
  });

  it('acota al último día del mes destino en lugar de desbordar', () => {
    expect(addCalendarMonths(local(2026, 10, 31), 4)).toEqual(
      local(2027, 2, 28),
    );
    expect(addCalendarMonths(local(2027, 10, 31), 4)).toEqual(
      local(2028, 2, 29),
    );
  });

  it('resta meses para calcular el corte', () => {
    expect(hairProfileExpiryCutoff(local(2026, 10, 7))).toEqual(
      local(2026, 6, 7),
    );
  });
});

describe('getHairProfileStatus (vigencia de 4 meses)', () => {
  const now = local(2026, 10, 7);

  it('MISSING si falta largo, color o fecha', () => {
    expect(
      getHairProfileStatus(
        { ...profile(local(2026, 9, 1)), hairLength: null },
        now,
      ),
    ).toBe('MISSING');
    expect(
      getHairProfileStatus(
        { ...profile(local(2026, 9, 1)), hairColor: null },
        now,
      ),
    ).toBe('MISSING');
    expect(getHairProfileStatus(profile(null), now)).toBe('MISSING');
  });

  it('VALID dentro de los 4 meses', () => {
    expect(getHairProfileStatus(profile(local(2026, 6, 8)), now)).toBe('VALID');
  });

  it('EXPIRED al cumplirse los 4 meses de calendario', () => {
    expect(getHairProfileStatus(profile(local(2026, 6, 7)), now)).toBe(
      'EXPIRED',
    );
    expect(getHairProfileStatus(profile(local(2026, 1, 1)), now)).toBe(
      'EXPIRED',
    );
  });
});

describe('toHairProfileView', () => {
  const now = local(2026, 10, 7);

  it('expone validUntil y estado de un perfil vigente', () => {
    expect(toHairProfileView(profile(local(2026, 9, 1)), now)).toEqual({
      hairLength: 'LARGO',
      hairColor: 'OSCURO',
      updatedAt: local(2026, 9, 1),
      validUntil: local(2027, 1, 1),
      status: 'VALID',
    });
  });

  it('sin perfil no hay validUntil', () => {
    expect(
      toHairProfileView(
        { hairLength: null, hairColor: null, hairProfileUpdatedAt: null },
        now,
      ),
    ).toEqual({
      hairLength: null,
      hairColor: null,
      updatedAt: null,
      validUntil: null,
      status: 'MISSING',
    });
  });
});
