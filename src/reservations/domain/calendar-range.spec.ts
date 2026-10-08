import { AppException } from '../../common/errors/app.exception';
import { resolveCalendarRange } from './calendar-range';

const iso = (date?: Date) => date?.toISOString();

describe('resolveCalendarRange', () => {
  it('date tiene prioridad y cubre ese día en Bogotá', () => {
    const range = resolveCalendarRange({
      date: '2026-12-09',
      from: '2026-01-01',
    });
    expect(iso(range.dayStart)).toBe('2026-12-09T05:00:00.000Z');
    expect(iso(range.dayEnd)).toBe('2026-12-10T05:00:00.000Z');
  });

  it('from y to incluyen ambos días completos', () => {
    const range = resolveCalendarRange({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(iso(range.dayStart)).toBe('2026-12-01T05:00:00.000Z');
    expect(iso(range.dayEnd)).toBe('2027-01-01T05:00:00.000Z');
  });

  it('solo from deja el rango abierto hacia el futuro', () => {
    const range = resolveCalendarRange({ from: '2026-12-01' });
    expect(iso(range.dayStart)).toBe('2026-12-01T05:00:00.000Z');
    expect(range.dayEnd).toBeUndefined();
  });

  it('rechaza from posterior a to', () => {
    expect(() =>
      resolveCalendarRange({ from: '2026-12-10', to: '2026-12-09' }),
    ).toThrow(AppException);
  });

  it('con límite exige rango cerrado y no mayor al máximo', () => {
    expect(() => resolveCalendarRange({ from: '2026-12-01' }, 62)).toThrow(
      AppException,
    );
    expect(() =>
      resolveCalendarRange({ from: '2026-01-01', to: '2026-12-31' }, 62),
    ).toThrow(AppException);
    expect(
      resolveCalendarRange({ from: '2026-11-30', to: '2027-01-10' }, 62).dayEnd,
    ).toBeDefined();
  });
});
