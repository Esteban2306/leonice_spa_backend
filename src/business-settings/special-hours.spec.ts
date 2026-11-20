import { describeSpecialHours, SPECIAL_HOURS_MAX_CHARS } from './special-hours';
import {
  BUSINESS_INFO_MAPPING_RULES,
  buildBotBusinessInfo,
  businessInfoEventPayload,
} from './business-info';

const december = (dayKey: string) => ({
  dayKey,
  windows: [[7 * 60, 19 * 60]] as Array<[number, number]>,
  startMinutes: [7 * 60, 10 * 60, 14 * 60],
  reason: 'Horarios de diciembre',
});

describe('horarios especiales que ve el asistente', () => {
  it('agrupa las fechas seguidas con el mismo horario y dice las horas de inicio', () => {
    const days = Array.from({ length: 31 }, (_, i) =>
      december(`2026-12-${String(i + 1).padStart(2, '0')}`),
    );
    expect(describeSpecialHours(days)).toBe(
      '1 al 31 de diciembre: citas a las 7:00 a. m., 10:00 a. m. y 2:00 p. m. (Horarios de diciembre)',
    );
  });

  it('separa un día cerrado y un horario sin horas fijas', () => {
    expect(
      describeSpecialHours([
        december('2026-12-23'),
        {
          dayKey: '2026-12-24',
          windows: [],
          startMinutes: [],
          reason: 'Navidad',
        },
        {
          dayKey: '2026-12-26',
          windows: [[8 * 60, 12 * 60]],
          startMinutes: [],
          reason: null,
        },
      ]),
    ).toBe(
      '23 de diciembre: citas a las 7:00 a. m., 10:00 a. m. y 2:00 p. m. (Horarios de diciembre) | 24 de diciembre: cerrado (Navidad) | 26 de diciembre: abierto de 8:00 a. m. a 12:00 p. m.',
    );
  });

  it('un rango que cruza de mes nombra ambos meses', () => {
    expect(
      describeSpecialHours([december('2026-11-30'), december('2026-12-01')]),
    ).toContain('30 de noviembre al 1 de diciembre');
  });

  it('nunca pasa del largo que el asistente lee de cada dato', () => {
    const scattered = Array.from({ length: 30 }, (_, i) =>
      december(`2026-12-${String(i * 2 + 1).padStart(2, '0')}`),
    ).filter((d) => Number(d.dayKey.slice(-2)) <= 31);
    expect(describeSpecialHours(scattered).length).toBeLessThanOrEqual(
      SPECIAL_HOURS_MAX_CHARS,
    );
  });

  it('llegan al asistente como negocio.horarios_especiales, y sin horarios el dato queda vacío', () => {
    const settings = {
      depositAmount: null,
      depositInstructions: null,
      depositPolicy: null,
      cancellationPolicy: null,
      address: null,
      additionalInfo: null,
      assessmentOffer: null,
    };
    expect(BUSINESS_INFO_MAPPING_RULES.special_hours).toBe(
      'negocio.horarios_especiales',
    );
    expect(
      businessInfoEventPayload(buildBotBusinessInfo(settings, [], [], []))
        .special_hours,
    ).toBe('');
    expect(
      businessInfoEventPayload(
        buildBotBusinessInfo(settings, [], [], [december('2026-12-19')]),
      ).special_hours,
    ).toContain('19 de diciembre');
  });
});
