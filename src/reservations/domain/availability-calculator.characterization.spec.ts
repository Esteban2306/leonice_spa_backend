import {
  generateAvailableSlots,
  HeldInterval,
  maxConcurrentInWindow,
} from './availability-calculator';

const at = (hour: number, minute = 0): Date =>
  new Date(2026, 9, 5, hour, minute, 0, 0);

const interval = (start: Date, end: Date): HeldInterval => ({
  scheduledStart: start,
  scheduledEnd: end,
});

const label = (date: Date): string =>
  `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

const MORNING = { start: at(8), end: at(12) };
const AFTERNOON = { start: at(14), end: at(16) };

describe('maxConcurrentInWindow (caracterización)', () => {
  it('sin reservas, la concurrencia es 0', () => {
    expect(maxConcurrentInWindow([], at(8), at(9))).toBe(0);
  });

  it('una reserva que termina justo al inicio de la ventana no cuenta', () => {
    expect(maxConcurrentInWindow([interval(at(7), at(8))], at(8), at(9))).toBe(
      0,
    );
  });

  it('una reserva que empezó antes y sigue activa al inicio cuenta', () => {
    expect(maxConcurrentInWindow([interval(at(7), at(9))], at(8), at(9))).toBe(
      1,
    );
  });

  it('una reserva que empieza justo al final de la ventana no cuenta (igual que el SQL de escritura)', () => {
    expect(maxConcurrentInWindow([interval(at(9), at(10))], at(8), at(9))).toBe(
      0,
    );
  });

  it('dos reservas simultáneas al inicio suman 2', () => {
    expect(
      maxConcurrentInWindow(
        [interval(at(8), at(10)), interval(at(9), at(11))],
        at(9),
        at(10),
      ),
    ).toBe(2);
  });

  it('reservas consecutivas no se suman', () => {
    expect(
      maxConcurrentInWindow(
        [interval(at(8), at(9)), interval(at(9), at(10))],
        at(8),
        at(10),
      ),
    ).toBe(1);
  });

  it('una reserva que entra a mitad de la ventana eleva el máximo', () => {
    expect(
      maxConcurrentInWindow(
        [interval(at(8), at(10)), interval(at(9, 30), at(10, 30))],
        at(8),
        at(10),
      ),
    ).toBe(2);
  });
});

describe('generateAvailableSlots (caracterización)', () => {
  it('un tratamiento de 3 h en la mañana 8-12 solo arranca hasta las 9:00', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [MORNING],
      held: [],
      durationMinutes: 180,
      capacity: 1,
    });
    expect(slots.map(label)).toEqual(['8:00', '8:15', '8:30', '8:45', '9:00']);
  });

  it('una duración igual a la ventana deja un único horario', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [MORNING],
      held: [],
      durationMinutes: 240,
      capacity: 1,
    });
    expect(slots.map(label)).toEqual(['8:00']);
  });

  it('una duración mayor que la ventana no ofrece nada, sin error', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [MORNING],
      held: [],
      durationMinutes: 300,
      capacity: 1,
    });
    expect(slots).toEqual([]);
  });

  it('con dos ventanas, ningún horario cruza el almuerzo', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [MORNING, AFTERNOON],
      held: [],
      durationMinutes: 120,
      capacity: 1,
    });
    const times = slots.map(label);
    expect(times).toHaveLength(10);
    expect(times[8]).toBe('10:00');
    expect(times[9]).toBe('14:00');
  });

  it('respeta un paso personalizado', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [MORNING],
      held: [],
      durationMinutes: 60,
      capacity: 1,
      stepMinutes: 60,
    });
    expect(slots.map(label)).toEqual(['8:00', '9:00', '10:00', '11:00']);
  });

  it('con capacidad 1 y una reserva 8-9, solo queda libre desde las 9:00', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [{ start: at(8), end: at(10) }],
      held: [interval(at(8), at(9))],
      durationMinutes: 60,
      capacity: 1,
    });
    expect(slots.map(label)).toEqual(['9:00']);
  });

  it('con capacidad llena, un horario contiguo anterior a una reserva sigue disponible', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [{ start: at(8), end: at(10) }],
      held: [interval(at(9), at(10))],
      durationMinutes: 60,
      capacity: 1,
      stepMinutes: 60,
    });
    expect(slots.map(label)).toEqual(['8:00']);
  });

  it('la capacidad es un límite exclusivo: concurrente < capacidad', () => {
    const window = { start: at(8), end: at(10) };
    const held = [interval(at(8), at(10)), interval(at(8), at(10))];

    const full = generateAvailableSlots({
      operatingWindows: [window],
      held,
      durationMinutes: 60,
      capacity: 2,
      stepMinutes: 60,
    });
    const withRoom = generateAvailableSlots({
      operatingWindows: [window],
      held,
      durationMinutes: 60,
      capacity: 3,
      stepMinutes: 60,
    });

    expect(full).toEqual([]);
    expect(withRoom.map(label)).toEqual(['8:00', '9:00']);
  });

  it('con capacidad 0 (categoría sin pools activos) no ofrece nada, sin error', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [MORNING],
      held: [],
      durationMinutes: 60,
      capacity: 0,
    });
    expect(slots).toEqual([]);
  });
});
