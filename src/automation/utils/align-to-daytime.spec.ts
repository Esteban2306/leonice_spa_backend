import { alignToDaytime } from './align-to-daytime';

const bogota = (iso: string) => new Date(`${iso}-05:00`);

describe('alignToDaytime', () => {
  it('no mueve un instante dentro del horario diurno', () => {
    const at = bogota('2026-11-10T11:20:00');
    expect(alignToDaytime(at)).toBe(at);
  });

  it('adelanta de madrugada a la apertura del mismo día', () => {
    expect(alignToDaytime(bogota('2026-11-10T03:10:00'))).toEqual(
      bogota('2026-11-10T09:00:00'),
    );
  });

  it('pasa de la noche a la mañana siguiente', () => {
    expect(alignToDaytime(bogota('2026-11-10T21:45:00'))).toEqual(
      bogota('2026-11-11T09:00:00'),
    );
  });
});
