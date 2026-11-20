import { buildBookingSummary } from './reservation-booking-summary';

describe('buildBookingSummary', () => {
  it('un tratamiento sin ajuste', () => {
    const summary = buildBookingSummary([
      {
        treatmentName: 'Hidratación',
        scheduledStart: new Date('2026-01-01T09:00'),
        scheduledEnd: new Date('2026-01-01T11:00'),
        wasAdjusted: false,
      },
    ]);
    expect(summary).toContain('Hidratación');
    expect(summary).not.toContain('ajustó');
  });

  it('un tratamiento CON ajuste incluye el motivo', () => {
    const summary = buildBookingSummary([
      {
        treatmentName: 'Alisado',
        scheduledStart: new Date('2026-01-01T11:00'),
        scheduledEnd: new Date('2026-01-01T12:00'),
        wasAdjusted: true,
        adjustmentReason:
          'se ajustó para no cruzarse con otra cita tuya el mismo día',
      },
    ]);
    expect(summary).toContain('se ajustó');
  });

  it('varios tratamientos: itinerario completo', () => {
    const summary = buildBookingSummary([
      {
        treatmentName: 'Alisado',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T10:00'),
        wasAdjusted: false,
      },
      {
        treatmentName: 'Pedespa',
        scheduledStart: new Date('2026-01-01T10:00'),
        scheduledEnd: new Date('2026-01-01T11:00'),
        wasAdjusted: false,
      },
    ]);
    expect(summary).toContain('Alisado');
    expect(summary).toContain('Pedespa');
    expect(summary).toContain('organizada así');
  });

  it('un combo con los servicios al mismo tiempo dice la hora de inicio y hasta cuándo va cada uno', () => {
    const summary = buildBookingSummary([
      {
        treatmentName: 'Alisado',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T12:00'),
        wasAdjusted: false,
      },
      {
        treatmentName: 'Pedespa',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T09:00'),
        wasAdjusted: false,
      },
    ]);
    expect(summary).toContain('al mismo tiempo');
    expect(summary).toContain('Alisado (hasta las');
    expect(summary).toContain('Pedespa (hasta las');
  });
});
