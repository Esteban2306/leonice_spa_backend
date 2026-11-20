import { onePerHour } from './bot-slots';

const slot = (hhmm: string) => ({
  iso: new Date(`2026-12-05T${hhmm}:00-05:00`).toISOString(),
  localTime: hhmm,
});

describe('horarios que ofrece el bot', () => {
  it('ofrece un horario por hora en vez de uno cada 15 minutos', () => {
    const slots = [
      '08:00',
      '08:15',
      '08:30',
      '08:45',
      '09:00',
      '09:15',
      '10:00',
    ];
    expect(onePerHour(slots.map(slot)).map((s) => s.localTime)).toEqual([
      '08:00',
      '09:00',
      '10:00',
    ]);
  });

  it('si la hora en punto está ocupada ofrece el primer cupo libre de esa hora', () => {
    expect(
      onePerHour(['08:30', '08:45', '09:15'].map(slot)).map((s) => s.localTime),
    ).toEqual(['08:30', '09:15']);
  });

  it('no mezcla la misma hora de días distintos', () => {
    const other = {
      iso: new Date('2026-12-06T08:00:00-05:00').toISOString(),
      localTime: 'otro',
    };
    expect(onePerHour([slot('08:00'), other])).toHaveLength(2);
  });
});
