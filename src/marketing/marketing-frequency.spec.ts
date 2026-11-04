import { blockedUntil, cooldownReason } from './marketing-frequency';

const now = new Date('2026-11-10T15:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('blockedUntil', () => {
  it('no bloquea a quien nunca recibió un mensaje', () => {
    expect(blockedUntil(null, 30, now)).toBeNull();
  });

  it('bloquea hasta cumplir los días configurados', () => {
    const until = blockedUntil(daysAgo(10), 30, now);
    expect(until?.getTime()).toBe(daysAgo(10).getTime() + 30 * 86_400_000);
  });

  it('libera al cumplirse el plazo', () => {
    expect(blockedUntil(daysAgo(30), 30, now)).toBeNull();
    expect(blockedUntil(daysAgo(45), 30, now)).toBeNull();
  });

  it('con cero días no limita', () => {
    expect(blockedUntil(daysAgo(1), 0, now)).toBeNull();
  });

  it('explica desde cuándo puede recibir otro mensaje', () => {
    const until = blockedUntil(daysAgo(10), 30, now);
    expect(cooldownReason(until as Date)).toBe(
      'Recibió otro mensaje de marketing; puede recibir otro desde el 30 de noviembre',
    );
  });
});
