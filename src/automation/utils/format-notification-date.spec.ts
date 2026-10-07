import { formatNotificationDateTime } from './format-notification-date';

describe('formatNotificationDateTime', () => {
  it('muestra la hora de Bogotá, no la UTC', () => {
    const result = formatNotificationDateTime(new Date('2026-10-03T13:00:00Z'));
    expect(result).toMatch(/8:00/);
    expect(result).toMatch(/3 de octubre/);
  });

  it('conserva el día de Bogotá cuando en UTC ya es el día siguiente', () => {
    const result = formatNotificationDateTime(new Date('2026-10-04T04:30:00Z'));
    expect(result).toMatch(/11:30/);
    expect(result).toMatch(/3 de octubre/);
  });
});
