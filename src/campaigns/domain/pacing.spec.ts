import {
  bogotaDayIndex,
  bogotaMinuteOfDay,
  DEFAULT_SEND_WINDOWS,
  HARD_END_MINUTE,
  HARD_START_MINUTE,
  normalizeWindows,
  PACE_PROFILES,
  PaceProfile,
  planSchedule,
  seededRng,
} from './pacing';

const MONDAY_9AM = new Date('2026-11-09T14:00:00Z');

const plan = (
  count: number,
  pace: PaceProfile = 'EQUILIBRADO',
  extra: Partial<Parameters<typeof planSchedule>[0]> = {},
) =>
  planSchedule({
    count,
    start: MONDAY_9AM,
    pace,
    rng: seededRng(7),
    ...extra,
  });

describe('normalizeWindows', () => {
  it('recorta al rango permitido, une las que se tocan y descarta las muy cortas', () => {
    expect(
      normalizeWindows([
        { startMinute: 0, endMinute: 480 },
        { startMinute: 470, endMinute: 600 },
        { startMinute: 700, endMinute: 710 },
        { startMinute: 1300, endMinute: 1500 },
      ]),
    ).toEqual([
      { startMinute: HARD_START_MINUTE, endMinute: 600 },
      { startMinute: 1300, endMinute: HARD_END_MINUTE },
    ]);
  });

  it('usa las franjas por defecto si no queda ninguna válida', () => {
    expect(normalizeWindows([])).toEqual(DEFAULT_SEND_WINDOWS);
  });
});

describe('planSchedule', () => {
  it('genera exactamente los envíos pedidos, en orden y dentro de las franjas', () => {
    const times = plan(150);
    expect(times).toHaveLength(150);
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
    for (const time of times) {
      const minute = bogotaMinuteOfDay(time.getTime());
      expect(
        DEFAULT_SEND_WINDOWS.some(
          (w) => minute >= w.startMinute && minute < w.endMinute,
        ),
      ).toBe(true);
      expect(minute).toBeGreaterThanOrEqual(HARD_START_MINUTE);
      expect(minute).toBeLessThan(HARD_END_MINUTE);
    }
  });

  it('respeta el tope diario y reparte el resto en los días siguientes', () => {
    const times = plan(200, 'RAPIDO', { maxPerDay: 60 });
    const perDay = new Map<number, number>();
    for (const time of times) {
      const day = bogotaDayIndex(time.getTime());
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(60);
    expect(perDay.size).toBeGreaterThanOrEqual(4);
  });

  it('respeta el tope por hora de cada ritmo', () => {
    for (const pace of ['SEGURO', 'EQUILIBRADO', 'RAPIDO'] as const) {
      const times = plan(120, pace, { maxPerDay: 300 });
      const cap = PACE_PROFILES[pace].hourlyCap;
      for (let i = 0; i < times.length; i++) {
        const inHour = times.filter(
          (t) =>
            t.getTime() >= times[i].getTime() &&
            t.getTime() < times[i].getTime() + 3_600_000,
        ).length;
        expect(inHour).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('nunca manda dos mensajes con menos separación que el mínimo del ritmo', () => {
    const times = plan(80, 'SEGURO');
    const min = PACE_PROFILES.SEGURO.gapSeconds[0] * 1000;
    for (let i = 1; i < times.length; i++) {
      expect(
        times[i].getTime() - times[i - 1].getTime(),
      ).toBeGreaterThanOrEqual(min - 1);
    }
  });

  it('si se pide fuera de horario, empieza en la siguiente franja', () => {
    const night = new Date('2026-11-10T03:00:00Z');
    const [first] = plan(1, 'EQUILIBRADO', { start: night });
    const minute = bogotaMinuteOfDay(first.getTime());
    expect(minute).toBeGreaterThanOrEqual(DEFAULT_SEND_WINDOWS[0].startMinute);
    expect(first.getTime()).toBeGreaterThan(night.getTime());
    expect(bogotaDayIndex(first.getTime())).toBe(
      bogotaDayIndex(night.getTime()) + 1,
    );
  });

  it('descuenta lo ya enviado hoy', () => {
    const today = bogotaDayIndex(MONDAY_9AM.getTime());
    const times = plan(10, 'EQUILIBRADO', {
      maxPerDay: 20,
      alreadySentToday: 15,
    });
    const onToday = times.filter(
      (t) => bogotaDayIndex(t.getTime()) === today,
    ).length;
    expect(onToday).toBeLessThanOrEqual(5);
  });

  it('es determinista con la misma semilla y distinto con otra', () => {
    expect(plan(30).map(String)).toEqual(plan(30).map(String));
    expect(plan(30).map(String)).not.toEqual(
      plan(30, 'EQUILIBRADO', { rng: seededRng(99) }).map(String),
    );
  });

  it('con el ritmo equilibrado 150 envíos terminan en 2 días o menos', () => {
    const times = plan(150);
    const days =
      bogotaDayIndex(times[149].getTime()) -
      bogotaDayIndex(times[0].getTime()) +
      1;
    expect(days).toBeLessThanOrEqual(3);
  });
});
