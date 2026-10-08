import { computeDepositExpiry } from './deposit-expiry';
import {
  DEFAULT_WEEKLY_WINDOWS,
  DayException,
  getOperatingWindowsForDate,
} from './operating-hours';

const TWO_HOURS = 2 * 60 * 60 * 1000;

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute, 0, 0);

const windowsWith =
  (exceptionsByDay: Record<number, DayException[]> = {}) =>
  (day: Date) =>
    getOperatingWindowsForDate(day, {
      base: DEFAULT_WEEKLY_WINDOWS,
      exceptions: exceptionsByDay[day.getDate()] ?? [],
    });

const expiry = (
  startedAt: Date,
  options: {
    notAfter?: Date;
    exceptions?: Record<number, DayException[]>;
  } = {},
) =>
  computeDepositExpiry({
    startedAt,
    operatingMs: TWO_HOURS,
    notAfter: options.notAfter ?? at(31, 23),
    windowsForDay: windowsWith(options.exceptions),
  });

describe('computeDepositExpiry (jueves 22 oct 2026: 8-12 y 14-16)', () => {
  it('dentro del horario corre como un reloj normal', () => {
    expect(expiry(at(22, 9))).toEqual(at(22, 11));
  });

  it('se pausa en el almuerzo y sigue a las 14:00', () => {
    expect(expiry(at(22, 11))).toEqual(at(22, 15));
  });

  it('creada de noche empieza a contar en la apertura del día siguiente', () => {
    expect(expiry(at(22, 20))).toEqual(at(23, 10));
  });

  it('creada en la madrugada cuenta desde la apertura del mismo día', () => {
    expect(expiry(at(22, 3))).toEqual(at(22, 10));
  });

  it('cruza el cierre: lo que no alcanzó hoy sigue mañana', () => {
    expect(expiry(at(22, 15, 30))).toEqual(at(23, 9, 30));
  });

  it('el fin de semana abre a las 7:00', () => {
    expect(expiry(at(23, 18))).toEqual(at(24, 9));
  });

  it('un bloqueo global de día completo pausa todo ese día', () => {
    const blockFriday = {
      23: [
        {
          type: 'BLOCK' as const,
          categoryId: null,
          startMinute: null,
          endMinute: null,
        },
      ],
    };
    expect(expiry(at(22, 20), { exceptions: blockFriday })).toEqual(at(24, 9));
  });

  it('una apertura extra cuenta como horario hábil', () => {
    const openLunch = {
      22: [
        {
          type: 'OPEN' as const,
          categoryId: null,
          startMinute: 12 * 60,
          endMinute: 14 * 60,
        },
      ],
    };
    expect(expiry(at(22, 11), { exceptions: openLunch })).toEqual(at(22, 13));
  });

  it('los bloqueos de una sola categoría no pausan el plazo', () => {
    const blockSpa = {
      22: [
        {
          type: 'BLOCK' as const,
          categoryId: 'cat-spa',
          startMinute: null,
          endMinute: null,
        },
      ],
    };
    expect(expiry(at(22, 9), { exceptions: blockSpa })).toEqual(at(22, 11));
  });

  it('nunca vence después de que empiece la cita', () => {
    expect(expiry(at(22, 20), { notAfter: at(23, 9) })).toEqual(at(23, 9));
  });

  it('si la cita ya empezó, vence de inmediato', () => {
    expect(expiry(at(22, 10), { notAfter: at(22, 9) })).toEqual(at(22, 9));
  });
});
