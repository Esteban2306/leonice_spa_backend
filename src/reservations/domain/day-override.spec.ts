import { generateAvailableSlots } from './availability-calculator';
import {
  buildDayOverride,
  dayKeysBetween,
  describeDayOverrideIssue,
  toOverrideView,
} from './day-override';
import {
  DEFAULT_WEEKLY_WINDOWS,
  fixedStartMinutes,
  getOperatingWindowsForDate,
  resolveDayMinuteRanges,
} from './operating-hours';

const SATURDAY = new Date('2026-12-19T00:00:00');

describe('horario especial de una fecha', () => {
  const december = buildDayOverride(
    [{ startTime: '07:00', endTime: '19:00' }],
    ['14:00', '07:00', '10:00'],
  ).override;

  it('reemplaza por completo el horario semanal de ese día', () => {
    expect(
      resolveDayMinuteRanges(SATURDAY.getDay(), {
        base: DEFAULT_WEEKLY_WINDOWS,
        exceptions: [],
        override: december,
      }),
    ).toEqual([[7 * 60, 19 * 60]]);
  });

  it('sin franjas, el día queda cerrado', () => {
    const closed = buildDayOverride([], []).override;
    expect(
      getOperatingWindowsForDate(SATURDAY, {
        base: DEFAULT_WEEKLY_WINDOWS,
        exceptions: [],
        override: closed,
      }),
    ).toEqual([]);
  });

  it('un bloqueo puntual sigue aplicando encima del horario especial', () => {
    expect(
      resolveDayMinuteRanges(SATURDAY.getDay(), {
        base: DEFAULT_WEEKLY_WINDOWS,
        exceptions: [
          {
            type: 'BLOCK',
            categoryId: null,
            startMinute: 12 * 60,
            endMinute: 13 * 60,
          },
        ],
        override: december,
      }),
    ).toEqual([
      [7 * 60, 12 * 60],
      [13 * 60, 19 * 60],
    ]);
  });

  it('las horas de inicio quedan ordenadas y sin repetir', () => {
    expect(fixedStartMinutes({ override: december })).toEqual([
      7 * 60,
      10 * 60,
      14 * 60,
    ]);
    expect(fixedStartMinutes({ override: null })).toBeNull();
    expect(
      fixedStartMinutes({ override: { windows: [], startMinutes: [] } }),
    ).toBeNull();
  });

  it('rechaza franjas al revés, cruzadas o horas de inicio fuera de las franjas', () => {
    const { issues } = buildDayOverride(
      [
        { startTime: '10:00', endTime: '09:00' },
        { startTime: '07:00', endTime: '12:00' },
        { startTime: '11:00', endTime: '15:00' },
      ],
      ['20:00'],
    );
    expect(issues.map((i) => i.code)).toEqual([
      'INVALID_WINDOW',
      'OVERLAPPING_WINDOWS',
      'START_OUTSIDE_WINDOWS',
    ]);
    expect(issues.map(describeDayOverrideIssue).join(' ')).toContain('20:00');
  });

  it('recorre cada fecha de un rango, incluso al cambiar de mes', () => {
    expect(dayKeysBetween('2026-11-30', '2026-12-02')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
  });

  it('se muestra con horas legibles', () => {
    expect(
      toOverrideView({
        dayKey: '2026-12-19',
        ...december,
        reason: 'Diciembre',
      }),
    ).toEqual({
      date: '2026-12-19',
      isClosed: false,
      windows: [{ startTime: '07:00', endTime: '19:00' }],
      startTimes: ['07:00', '10:00', '14:00'],
      reason: 'Diciembre',
    });
  });
});

describe('cupos con horas de inicio fijas', () => {
  const windows = [
    {
      start: new Date('2026-12-19T07:00:00'),
      end: new Date('2026-12-19T19:00:00'),
    },
  ];
  const starts = [7 * 60, 10 * 60, 14 * 60];

  it('solo ofrece las horas de inicio permitidas, no cada 15 minutos', () => {
    const slots = generateAvailableSlots({
      operatingWindows: windows,
      held: [],
      durationMinutes: 240,
      capacity: 1,
      startMinutes: starts,
    });
    expect(slots.map((s) => s.getHours())).toEqual([7, 10, 14]);
  });

  it('una hora de inicio cuyo servicio no alcanza a terminar antes del cierre no se ofrece', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [
        { start: windows[0].start, end: new Date('2026-12-19T16:00:00') },
      ],
      held: [],
      durationMinutes: 240,
      capacity: 1,
      startMinutes: starts,
    });
    expect(slots.map((s) => s.getHours())).toEqual([7, 10]);
  });

  it('una hora de inicio ocupada no se ofrece', () => {
    const slots = generateAvailableSlots({
      operatingWindows: windows,
      held: [
        {
          scheduledStart: new Date('2026-12-19T10:00:00'),
          scheduledEnd: new Date('2026-12-19T14:00:00'),
        },
      ],
      durationMinutes: 240,
      capacity: 1,
      startMinutes: starts,
    });
    expect(slots.map((s) => s.getHours())).toEqual([14]);
  });

  it('sin horas fijas se sigue ofreciendo cada 15 minutos', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [
        {
          start: new Date('2026-12-19T07:00:00'),
          end: new Date('2026-12-19T08:00:00'),
        },
      ],
      held: [],
      durationMinutes: 30,
      capacity: 1,
      startMinutes: null,
    });
    expect(slots).toHaveLength(3);
  });
});
