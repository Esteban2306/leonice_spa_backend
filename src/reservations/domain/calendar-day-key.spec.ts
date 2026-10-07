import { getCalendarDayKey } from './calendar-day-key';

describe('getCalendarDayKey', () => {
  it('usa el día local de Bogotá, no el día UTC', () => {
    const lateEvening = new Date('2026-10-23T02:00:00.000Z');

    expect(getCalendarDayKey(lateEvening)).toBe('2026-10-22');
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-10-23');
  });
});
