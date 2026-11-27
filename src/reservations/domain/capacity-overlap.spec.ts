import { generateAvailableSlots } from './availability-calculator';
import { evaluatePlacement } from './evaluate-placement';

const at = (hhmm: string) => new Date(`2027-01-04T${hhmm}:00`);

const eightAtEight = Array.from({ length: 8 }, () => ({
  scheduledStart: at('08:00'),
  scheduledEnd: at('10:00'),
}));

const window = [{ start: at('08:00'), end: at('18:00') }];

describe('el cupo se respeta durante toda la cita, no solo a la hora de inicio', () => {
  it('con 8 personas a las 8:00 por 2 horas no se ofrece ningún horario hasta las 10:00', () => {
    const slots = generateAvailableSlots({
      operatingWindows: window,
      held: eightAtEight,
      durationMinutes: 60,
      capacity: 8,
    }).map((d) => d.toTimeString().slice(0, 5));

    expect(slots[0]).toBe('10:00');
    for (const blocked of ['08:00', '08:15', '08:30', '09:00', '09:45']) {
      expect(slots).not.toContain(blocked);
    }
  });

  it('una cita que empieza antes y termina dentro de la franja ocupada tampoco cabe', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [{ start: at('07:00'), end: at('18:00') }],
      held: eightAtEight,
      durationMinutes: 90,
      capacity: 8,
    }).map((d) => d.toTimeString().slice(0, 5));

    expect(slots).not.toContain('07:00');
    expect(slots).not.toContain('07:15');
    expect(slots).toContain('10:00');
  });

  it('con un cupo libre se puede agendar una persona más, y la siguiente ya no', () => {
    const seven = eightAtEight.slice(0, 7);
    const input = {
      end: at('09:15'),
      now: at('06:00'),
      operatingWindows: window,
      capacity: 8,
      hasDuplicateBooking: false,
    };
    expect(
      evaluatePlacement({ ...input, start: at('08:15'), held: seven }),
    ).toEqual({ ok: true });
    expect(
      evaluatePlacement({
        ...input,
        start: at('08:15'),
        held: [
          ...seven,
          { scheduledStart: at('08:15'), scheduledEnd: at('09:15') },
        ],
      }),
    ).toEqual({ ok: false, reason: 'NO_CAPACITY' });
  });

  it('al guardar se revalida: nadie entra a las 8:15 ni a las 9:45 si las 8 de las 8:00 siguen ahí', () => {
    for (const start of ['08:15', '09:45']) {
      const startDate = at(start);
      expect(
        evaluatePlacement({
          start: startDate,
          end: new Date(startDate.getTime() + 60 * 60_000),
          now: at('06:00'),
          operatingWindows: window,
          held: eightAtEight,
          capacity: 8,
          hasDuplicateBooking: false,
        }),
      ).toEqual({ ok: false, reason: 'NO_CAPACITY' });
    }
  });
});
