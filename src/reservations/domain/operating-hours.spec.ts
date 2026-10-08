import {
  DEFAULT_WEEKLY_WINDOWS,
  DayException,
  DaySchedule,
  findIntervalsOutsideWindows,
  getOperatingWindowsForDate,
  mergeMinuteRanges,
  subtractMinuteRanges,
} from './operating-hours';

const toIso = (windows: { start: Date; end: Date }[]) =>
  windows.map((w) => [w.start.toISOString(), w.end.toISOString()]);

const hours = (windows: { start: Date; end: Date }[]) =>
  windows.map((w) => [
    w.start.getHours() + w.start.getMinutes() / 60,
    w.end.getHours() + w.end.getMinutes() / 60,
  ]);

const THURSDAY = new Date(2026, 9, 22);
const SPA = 'cat-spa';
const NAILS = 'cat-nails';

const schedule = (exceptions: DayException[] = []): DaySchedule => ({
  base: DEFAULT_WEEKLY_WINDOWS,
  exceptions,
});

const block = (
  categoryId: string | null,
  startMinute: number | null = null,
  endMinute: number | null = null,
): DayException => ({ type: 'BLOCK', categoryId, startMinute, endMinute });

const open = (
  categoryId: string | null,
  startMinute: number,
  endMinute: number,
): DayException => ({ type: 'OPEN', categoryId, startMinute, endMinute });

describe('getOperatingWindowsForDate — horario base', () => {
  it('corre en America/Bogota; si falla, el TZ del proceso no está fijado', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      'America/Bogota',
    );
  });

  it('jueves: 8-12 y 14-16 hora Bogotá', () => {
    expect(toIso(getOperatingWindowsForDate(THURSDAY, schedule()))).toEqual([
      ['2026-10-22T13:00:00.000Z', '2026-10-22T17:00:00.000Z'],
      ['2026-10-22T19:00:00.000Z', '2026-10-22T21:00:00.000Z'],
    ]);
  });

  it('sábado: 7-12 y 14-16 hora Bogotá', () => {
    expect(
      toIso(getOperatingWindowsForDate(new Date(2026, 9, 24), schedule())),
    ).toEqual([
      ['2026-10-24T12:00:00.000Z', '2026-10-24T17:00:00.000Z'],
      ['2026-10-24T19:00:00.000Z', '2026-10-24T21:00:00.000Z'],
    ]);
  });

  it('un día sin franjas base queda cerrado', () => {
    const onlyWeekdays: DaySchedule = {
      base: DEFAULT_WEEKLY_WINDOWS.filter((w) => w.dayOfWeek !== 0),
      exceptions: [],
    };
    expect(
      getOperatingWindowsForDate(new Date(2026, 9, 25), onlyWeekdays),
    ).toEqual([]);
  });
});

describe('getOperatingWindowsForDate — bloqueos', () => {
  it('bloqueo global de día completo cierra todas las categorías', () => {
    expect(
      getOperatingWindowsForDate(THURSDAY, schedule([block(null)]), SPA),
    ).toEqual([]);
    expect(
      getOperatingWindowsForDate(THURSDAY, schedule([block(null)])),
    ).toEqual([]);
  });

  it('bloqueo por categoría solo cierra esa categoría', () => {
    const s = schedule([block(SPA)]);
    expect(getOperatingWindowsForDate(THURSDAY, s, SPA)).toEqual([]);
    expect(hours(getOperatingWindowsForDate(THURSDAY, s, NAILS))).toEqual([
      [8, 12],
      [14, 16],
    ]);
    expect(hours(getOperatingWindowsForDate(THURSDAY, s))).toEqual([
      [8, 12],
      [14, 16],
    ]);
  });

  it('bloqueo de franja parte la ventana', () => {
    const s = schedule([block(null, 9 * 60, 10 * 60 + 30)]);
    expect(hours(getOperatingWindowsForDate(THURSDAY, s))).toEqual([
      [8, 9],
      [10.5, 12],
      [14, 16],
    ]);
  });
});

describe('getOperatingWindowsForDate — aperturas (override)', () => {
  it('abre horario extra y se fusiona con la franja contigua', () => {
    const s = schedule([open(null, 12 * 60, 14 * 60)]);
    expect(hours(getOperatingWindowsForDate(THURSDAY, s))).toEqual([[8, 16]]);
  });

  it('abre un día que no tenía horario base', () => {
    const closedSunday: DaySchedule = {
      base: DEFAULT_WEEKLY_WINDOWS.filter((w) => w.dayOfWeek !== 0),
      exceptions: [open(SPA, 9 * 60, 13 * 60)],
    };
    const sunday = new Date(2026, 9, 25);
    expect(
      hours(getOperatingWindowsForDate(sunday, closedSunday, SPA)),
    ).toEqual([[9, 13]]);
    expect(getOperatingWindowsForDate(sunday, closedSunday, NAILS)).toEqual([]);
  });

  it('el bloqueo gana sobre la apertura del mismo día', () => {
    const s = schedule([
      open(null, 16 * 60, 18 * 60),
      block(null, 15 * 60, 17 * 60),
    ]);
    expect(hours(getOperatingWindowsForDate(THURSDAY, s))).toEqual([
      [8, 12],
      [14, 15],
      [17, 18],
    ]);
  });
});

describe('aritmética de rangos', () => {
  it('fusiona rangos solapados o contiguos e ignora vacíos', () => {
    expect(
      mergeMinuteRanges([
        [600, 700],
        [480, 600],
        [800, 800],
        [650, 720],
      ]),
    ).toEqual([[480, 720]]);
  });

  it('resta varios cortes', () => {
    expect(
      subtractMinuteRanges(
        [[480, 720]],
        [
          [500, 520],
          [700, 800],
        ],
      ),
    ).toEqual([
      [480, 500],
      [520, 700],
    ]);
  });
});

describe('findIntervalsOutsideWindows', () => {
  const windows = getOperatingWindowsForDate(THURSDAY, schedule());
  const at = (h: number) => {
    const d = new Date(THURSDAY);
    d.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
    return d;
  };
  const r = (id: string, from: number, to: number) => ({
    id,
    scheduledStart: at(from),
    scheduledEnd: at(to),
  });

  it('devuelve solo los intervalos que no caben completos en una ventana', () => {
    const inside = r('in', 8, 10);
    const crossesLunch = r('lunch', 11, 13);
    const afterClose = r('late', 15, 17);
    expect(
      findIntervalsOutsideWindows(
        [inside, crossesLunch, afterClose],
        windows,
      ).map((x) => x.id),
    ).toEqual(['lunch', 'late']);
  });
});
