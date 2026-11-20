import { toBotLastVisit, toBotClient } from './bot-client-view';
import { NEW_CLIENT_INTRO } from './bot-client-view';

const now = new Date('2026-10-24T12:00:00Z');
const recent = new Date('2026-09-01T12:00:00Z');
const stale = new Date('2024-01-01T12:00:00Z');

const client = (over: Record<string, unknown> = {}) => ({
  name: ' Diana Pardo López ',
  hairLength: 'LARGO' as const,
  hairColor: 'OSCURO' as const,
  hairProfileUpdatedAt: recent,
  ...over,
});

describe('toBotClient', () => {
  it('un teléfono desconocido no está registrado y no revela nada más', () => {
    expect(toBotClient(null, false, now)).toEqual({
      registered: false,
      firstContactNotice: NEW_CLIENT_INTRO,
    });
  });

  it('una clienta registrada trae su nombre, el primer nombre y los términos', () => {
    const view = toBotClient(client(), true, now);
    expect(view).toMatchObject({
      registered: true,
      name: 'Diana Pardo López',
      firstName: 'Diana',
      termsAccepted: true,
    });
  });

  it('con perfil capilar vigente informa largo y color', () => {
    expect(toBotClient(client(), true, now).hairProfile).toEqual({
      status: 'VALID',
      hairLength: 'LARGO',
      hairColor: 'OSCURO',
    });
  });

  it('con perfil vigente y densidad registrada también la informa', () => {
    expect(
      toBotClient(client({ hairDensity: 'MEDIA' }), true, now).hairProfile,
    ).toEqual({
      status: 'VALID',
      hairLength: 'LARGO',
      hairColor: 'OSCURO',
      hairDensity: 'MEDIA',
    });
  });

  it('con perfil vencido o sin perfil solo informa el estado', () => {
    expect(
      toBotClient(client({ hairProfileUpdatedAt: stale }), true, now)
        .hairProfile,
    ).toEqual({ status: 'EXPIRED' });
    expect(
      toBotClient(
        client({
          hairLength: null,
          hairColor: null,
          hairProfileUpdatedAt: null,
        }),
        true,
        now,
      ).hairProfile,
    ).toEqual({ status: 'MISSING' });
  });

  it('nunca devuelve fecha de nacimiento, alergias ni embarazo', () => {
    const view = toBotClient(
      {
        ...client(),
        birthDate: new Date(),
        allergies: 'penicilina',
        isPregnant: true,
      } as never,
      true,
      now,
    );
    expect(JSON.stringify(view)).not.toMatch(
      /birth|allerg|pregnan|penicilina/i,
    );
  });
});

describe('última visita de la clienta', () => {
  it('dice la fecha y el servicio de su última cita completada', () => {
    expect(
      toBotLastVisit({
        completedAt: new Date('2026-10-15T20:00:00Z'),
        scheduledStart: new Date('2026-10-15T15:00:00Z'),
        treatment: { name: 'Alisado' },
      }),
    ).toEqual({ date: '15 de octubre de 2026', treatment: 'Alisado' });
  });

  it('sin visitas no trae nada', () => {
    expect(toBotLastVisit(null)).toBeUndefined();
  });
});
