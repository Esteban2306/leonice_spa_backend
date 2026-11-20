import { depositReminderAt, remindsForCombo } from './deposit-reminder';

const now = new Date('2026-12-01T14:00:00Z');
const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000);

describe('recordatorio del anticipo', () => {
  it('se envía 30 minutos antes de que venza el plazo', () => {
    expect(depositReminderAt(inMinutes(120), now)).toEqual(inMinutes(90));
  });

  it('si el plazo es corto (una cita de hoy) no se envía', () => {
    expect(depositReminderAt(inMinutes(50), now)).toBeNull();
    expect(depositReminderAt(inMinutes(20), now)).toBeNull();
  });

  it('en un combo se recuerda una sola vez, por el servicio que empieza primero', () => {
    const at = (h: number) => new Date(`2026-12-05T${h}:00:00-05:00`);
    expect(
      remindsForCombo([
        { id: 'b', scheduledStart: at(10) },
        { id: 'a', scheduledStart: at(10) },
        { id: 'c', scheduledStart: at(11) },
      ])?.id,
    ).toBe('a');
    expect(remindsForCombo([])).toBeNull();
  });
});
