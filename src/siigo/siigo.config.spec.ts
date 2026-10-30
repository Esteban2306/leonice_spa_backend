import { ConfigService } from '@nestjs/config';
import { readSiigoSettings } from './siigo.config';
import { SiigoError } from './client/siigo.errors';

const configOf = (values: Record<string, unknown>) => new ConfigService(values);

const complete = {
  SIIGO_ENABLED: 'true',
  SIIGO_USERNAME: 'spa@leonice.test',
  SIIGO_ACCESS_KEY: 'clave',
  SIIGO_PARTNER_ID: 'LeoniceSpa',
};

describe('readSiigoSettings', () => {
  it('viene apagado por defecto y no exige credenciales', () => {
    const settings = readSiigoSettings(configOf({}));

    expect(settings.enabled).toBe(false);
    expect(settings.baseUrl).toBe('https://api.siigo.com');
    expect(settings.timeoutMs).toBe(120_000);
  });

  it('activo y completo devuelve la configuración', () => {
    const settings = readSiigoSettings(
      configOf({ ...complete, SIIGO_BASE_URL: 'https://api.siigo.com/' }),
    );

    expect(settings.enabled).toBe(true);
    expect(settings.baseUrl).toBe('https://api.siigo.com');
  });

  it('activo con credenciales faltantes falla y dice cuáles', () => {
    expect(() =>
      readSiigoSettings(configOf({ SIIGO_ENABLED: 'true' })),
    ).toThrow(/SIIGO_USERNAME, SIIGO_ACCESS_KEY, SIIGO_PARTNER_ID/);
  });

  it.each(['ab', 'Leonice Spa', 'Leonice-Spa'])(
    'rechaza el Partner-Id inválido %p',
    (partnerId) => {
      expect(() =>
        readSiigoSettings(
          configOf({ ...complete, SIIGO_PARTNER_ID: partnerId }),
        ),
      ).toThrow(SiigoError);
    },
  );

  it('rechaza un tiempo de espera demasiado corto', () => {
    expect(() =>
      readSiigoSettings(configOf({ ...complete, SIIGO_TIMEOUT_MS: 100 })),
    ).toThrow(/SIIGO_TIMEOUT_MS/);
  });
});
