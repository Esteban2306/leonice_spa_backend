import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SetHairProfileDto } from './set-hair-profile.dto';

const errorsOf = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(SetHairProfileDto, body)).map(
    (error) => error.property,
  );

const complete = {
  hairLength: 'LARGO',
  hairColor: 'OSCURO',
  hairDensity: 'MEDIA',
};

describe('SetHairProfileDto', () => {
  it('acepta largo, color y densidad', () => {
    expect(errorsOf(complete)).toEqual([]);
  });

  it.each(['BAJA', 'MEDIA', 'ALTA'])('acepta la densidad %s', (density) => {
    expect(errorsOf({ ...complete, hairDensity: density })).toEqual([]);
  });

  it('exige la densidad', () => {
    expect(errorsOf({ hairLength: 'LARGO', hairColor: 'OSCURO' })).toEqual([
      'hairDensity',
    ]);
  });

  it('rechaza valores que no existen', () => {
    expect(errorsOf({ ...complete, hairDensity: 'MUCHA' })).toEqual([
      'hairDensity',
    ]);
  });
});
