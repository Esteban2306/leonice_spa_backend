import {
  calendarDateToUtcMidnight,
  isCalendarDate,
  isZonedDateTime,
  utcMidnightToCalendarDate,
} from './date-input.validators';

describe('isCalendarDate', () => {
  it.each(['2026-12-09', '2028-02-29', '1995-03-15'])('acepta %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-12-09T00:00:00',
    '2026-12-09T10:00:00Z',
    '09/12/2026',
    '',
    20261209,
  ])('rechaza %p', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});

describe('isZonedDateTime', () => {
  it.each([
    '2026-12-09T08:00:00-05:00',
    '2026-12-09T13:00:00Z',
    '2026-12-09T13:00:00.000Z',
    '2026-12-09T08:00-05:00',
  ])('acepta %s', (value) => {
    expect(isZonedDateTime(value)).toBe(true);
  });

  it.each([
    '2026-12-09T08:00:00',
    '2026-12-09',
    '2026-02-30T08:00:00-05:00',
    '2026-12-09T24:00:00Z',
    '2026-12-09 08:00:00-05:00',
    null,
  ])('rechaza %p (sin zona o inválida)', (value) => {
    expect(isZonedDateTime(value)).toBe(false);
  });
});

describe('fechas de calendario en UTC', () => {
  it('ida y vuelta sin corrimiento de día en America/Bogota', () => {
    const stored = calendarDateToUtcMidnight('1995-03-15');
    expect(stored.toISOString()).toBe('1995-03-15T00:00:00.000Z');
    expect(utcMidnightToCalendarDate(stored)).toBe('1995-03-15');
  });
});
