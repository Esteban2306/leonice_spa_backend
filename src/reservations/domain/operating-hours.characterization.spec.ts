import { getOperatingWindowsForDate } from './operating-hours';

const hours = (date: Date): number[][] =>
  getOperatingWindowsForDate(date).map((w) => [
    w.start.getHours(),
    w.end.getHours(),
  ]);

describe('getOperatingWindowsForDate (caracterización)', () => {
  it('lunes a viernes: 8-12 y 14-16', () => {
    expect(hours(new Date(2026, 9, 5))).toEqual([
      [8, 12],
      [14, 16],
    ]);
  });

  it('sábado: 7-12 y 14-16', () => {
    expect(hours(new Date(2026, 9, 3))).toEqual([
      [7, 12],
      [14, 16],
    ]);
  });

  it('domingo: 7-12 y 14-16', () => {
    expect(hours(new Date(2026, 9, 4))).toEqual([
      [7, 12],
      [14, 16],
    ]);
  });

  it('no muta la fecha de entrada y devuelve el mismo día', () => {
    const input = new Date(2026, 9, 5);
    const before = input.getTime();
    const windows = getOperatingWindowsForDate(input);
    expect(input.getTime()).toBe(before);
    expect(windows[0].start.getDate()).toBe(5);
  });
});
