import { getOperatingWindowsForDate } from './operating-hours';

const toIso = (windows: { start: Date; end: Date }[]) =>
  windows.map((w) => [w.start.toISOString(), w.end.toISOString()]);

describe('getOperatingWindowsForDate (caracterización)', () => {
  it('corre en America/Bogota; si falla, el TZ del proceso no está fijado', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      'America/Bogota',
    );
  });

  it('jueves: 8-12 y 14-16 hora Bogotá', () => {
    const windows = getOperatingWindowsForDate(new Date(2026, 9, 22));

    expect(toIso(windows)).toEqual([
      ['2026-10-22T13:00:00.000Z', '2026-10-22T17:00:00.000Z'],
      ['2026-10-22T19:00:00.000Z', '2026-10-22T21:00:00.000Z'],
    ]);
  });

  it('sábado: 7-12 y 14-16 hora Bogotá', () => {
    const windows = getOperatingWindowsForDate(new Date(2026, 9, 24));

    expect(toIso(windows)).toEqual([
      ['2026-10-24T12:00:00.000Z', '2026-10-24T17:00:00.000Z'],
      ['2026-10-24T19:00:00.000Z', '2026-10-24T21:00:00.000Z'],
    ]);
  });
});
