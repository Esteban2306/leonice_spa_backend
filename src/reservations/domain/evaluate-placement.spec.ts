import { evaluatePlacement, PlacementInput } from './evaluate-placement';

const at = (hour: number, minute = 0): Date =>
  new Date(2026, 9, 5, hour, minute, 0, 0);

const NOW = new Date(2026, 9, 1, 8, 0, 0, 0);
const MORNING = { start: at(8), end: at(12) };
const AFTERNOON = { start: at(14), end: at(16) };

const held = (startHour: number, endHour: number) => ({
  scheduledStart: at(startHour),
  scheduledEnd: at(endHour),
});

const base = (overrides: Partial<PlacementInput> = {}): PlacementInput => ({
  start: at(9),
  end: at(10),
  now: NOW,
  operatingWindows: [MORNING, AFTERNOON],
  held: [],
  capacity: 1,
  clientIntervals: [],
  hasCategoryDayConflict: false,
  ...overrides,
});

describe('evaluatePlacement', () => {
  it('acepta una colocación libre', () => {
    expect(evaluatePlacement(base())).toEqual({ ok: true });
  });

  it('rechaza un rango vacío o invertido', () => {
    expect(evaluatePlacement(base({ start: at(10), end: at(10) }))).toEqual({
      ok: false,
      reason: 'INVALID_RANGE',
    });
    expect(evaluatePlacement(base({ start: at(10), end: at(9) }))).toEqual({
      ok: false,
      reason: 'INVALID_RANGE',
    });
  });

  it('rechaza una hora pasada, incluida la hora exacta de ahora', () => {
    expect(evaluatePlacement(base({ now: at(9, 30) }))).toEqual({
      ok: false,
      reason: 'IN_THE_PAST',
    });
    expect(evaluatePlacement(base({ now: at(9) }))).toEqual({
      ok: false,
      reason: 'IN_THE_PAST',
    });
  });

  it('rechaza una cita antes de abrir', () => {
    expect(evaluatePlacement(base({ start: at(7), end: at(8) }))).toEqual({
      ok: false,
      reason: 'OUTSIDE_OPERATING_HOURS',
    });
  });

  it('rechaza una cita que cruza el almuerzo', () => {
    expect(evaluatePlacement(base({ start: at(11), end: at(15) }))).toEqual({
      ok: false,
      reason: 'OUTSIDE_OPERATING_HOURS',
    });
  });

  it('acepta una cita que llena exactamente la ventana', () => {
    expect(evaluatePlacement(base({ start: at(8), end: at(12) }))).toEqual({
      ok: true,
    });
  });

  it('rechaza si el cliente ya tiene otra reserva activa de la categoría ese día', () => {
    expect(evaluatePlacement(base({ hasCategoryDayConflict: true }))).toEqual({
      ok: false,
      reason: 'CATEGORY_DAY_CONFLICT',
    });
  });

  it('rechaza si la cita se cruza con otra del cliente', () => {
    expect(
      evaluatePlacement(
        base({ clientIntervals: [{ start: at(9, 30), end: at(10, 30) }] }),
      ),
    ).toEqual({ ok: false, reason: 'CLIENT_OVERLAP' });
  });

  it('acepta una cita del cliente contigua, no solapada', () => {
    expect(
      evaluatePlacement(
        base({ clientIntervals: [{ start: at(10), end: at(11) }] }),
      ),
    ).toEqual({ ok: true });
  });

  it('rechaza sin cupo', () => {
    expect(evaluatePlacement(base({ held: [held(9, 10)] }))).toEqual({
      ok: false,
      reason: 'NO_CAPACITY',
    });
  });

  it('una reserva contigua posterior no consume cupo', () => {
    expect(evaluatePlacement(base({ held: [held(10, 11)] }))).toEqual({
      ok: true,
    });
  });

  it('con capacidad 8, acepta con 7 simultáneas y rechaza con 8', () => {
    const seven = Array.from({ length: 7 }, () => held(9, 10));
    const eight = Array.from({ length: 8 }, () => held(9, 10));
    expect(evaluatePlacement(base({ capacity: 8, held: seven }))).toEqual({
      ok: true,
    });
    expect(evaluatePlacement(base({ capacity: 8, held: eight }))).toEqual({
      ok: false,
      reason: 'NO_CAPACITY',
    });
  });

  it('el horario se evalúa antes que el cupo', () => {
    expect(
      evaluatePlacement(base({ start: at(7), end: at(8), held: [held(7, 8)] })),
    ).toEqual({ ok: false, reason: 'OUTSIDE_OPERATING_HOURS' });
  });
});
