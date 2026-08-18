import {
  maxConcurrentInWindow,
  generateAvailableSlots,
} from './availability-calculator';

describe('maxConcurrentInWindow', () => {
  it('detecta que dos reservas que no se solapan entre sí nunca superan 1 concurrente, aunque ambas toquen una ventana larga', () => {
    const held = [
      {
        scheduledStart: new Date('2027-01-01T09:00:00'),
        scheduledEnd: new Date('2027-01-01T09:30:00'),
      },
      {
        scheduledStart: new Date('2027-01-01T09:45:00'),
        scheduledEnd: new Date('2027-01-01T10:15:00'),
      },
    ];

    const result = maxConcurrentInWindow(
      held,
      new Date('2027-01-01T09:00:00'),
      new Date('2027-01-01T10:15:00'),
    );

    expect(result).toBe(1);
  });

  it('sí detecta correctamente cuando dos reservas SÍ coexisten en el tiempo', () => {
    const held = [
      {
        scheduledStart: new Date('2027-01-01T09:00:00'),
        scheduledEnd: new Date('2027-01-01T10:00:00'),
      },
      {
        scheduledStart: new Date('2027-01-01T09:30:00'),
        scheduledEnd: new Date('2027-01-01T10:30:00'),
      },
    ];

    const result = maxConcurrentInWindow(
      held,
      new Date('2027-01-01T09:00:00'),
      new Date('2027-01-01T10:30:00'),
    );

    expect(result).toBe(2);
  });
});

describe('generateAvailableSlots', () => {
  it('respeta la pausa de almuerzo: ningún horario empieza dentro del break', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [
        {
          start: new Date('2027-01-04T08:00:00'),
          end: new Date('2027-01-04T12:00:00'),
        },
        {
          start: new Date('2027-01-04T14:00:00'),
          end: new Date('2027-01-04T16:00:00'),
        },
      ],
      held: [],
      durationMinutes: 60,
      capacity: 6,
    });

    const hasSlotInLunchBreak = slots.some(
      (s) => s.getHours() >= 12 && s.getHours() < 14,
    );
    expect(hasSlotInLunchBreak).toBe(false);
  });

  it('no genera un horario que empiece antes del cierre pero termine después', () => {
    const slots = generateAvailableSlots({
      operatingWindows: [
        {
          start: new Date('2027-01-04T08:00:00'),
          end: new Date('2027-01-04T09:30:00'),
        },
      ],
      held: [],
      durationMinutes: 60,
      capacity: 6,
    });

    const lastValidStart = new Date('2027-01-04T08:30:00').getTime();
    const hasInvalidSlot = slots.some((s) => s.getTime() > lastValidStart);
    expect(hasInvalidSlot).toBe(false);
  });
});
