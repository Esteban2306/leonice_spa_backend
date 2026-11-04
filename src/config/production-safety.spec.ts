import { productionIssues } from './production-safety';

const secret = (seed: string) => `${seed}-`.repeat(8) + 'k9Zq2';

const validEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: secret('access'),
  JWT_REFRESH_SECRET: secret('refresh'),
  CONDUIT_TOOL_API_KEY: secret('tool'),
  CONDUIT_WEBHOOK_SECRET: secret('hook'),
  CONDUIT_API_KEY: secret('conduit'),
  CONDUIT_BASE_URL: 'https://conduit.example.org',
  CORS_ORIGIN:
    'https://leonicespa.com,https://www.leonicespa.com,https://admin.leonicespa.com',
  COOKIE_DOMAIN: '.leonicespa.com',
};

describe('productionIssues', () => {
  it('no exige nada fuera de producción', () => {
    expect(productionIssues({ NODE_ENV: 'development' })).toEqual([]);
  });

  it('acepta la configuración del sitio, el panel y la API bajo el mismo dominio', () => {
    expect(productionIssues(validEnv)).toEqual([]);
  });

  it('exige COOKIE_DOMAIN porque sin ella el panel no puede leer la cookie CSRF', () => {
    const { COOKIE_DOMAIN: _removed, ...env } = validEnv;
    expect(productionIssues(env)).toEqual([
      expect.stringContaining('COOKIE_DOMAIN es obligatoria'),
    ]);
  });

  it('exige que COOKIE_DOMAIN empiece con punto', () => {
    expect(
      productionIssues({ ...validEnv, COOKIE_DOMAIN: 'leonicespa.com' }),
    ).toEqual([expect.stringContaining('debe empezar con punto')]);
  });

  it('rechaza un origen fuera de COOKIE_DOMAIN', () => {
    const issues = productionIssues({
      ...validEnv,
      CORS_ORIGIN: `${validEnv.CORS_ORIGIN},https://otro-sitio.com`,
    });
    expect(issues).toEqual([expect.stringContaining('https://otro-sitio.com')]);
  });

  it('no confunde un dominio que solo termina igual', () => {
    expect(
      productionIssues({
        ...validEnv,
        CORS_ORIGIN: 'https://notleonicespa.com',
      }),
    ).toEqual([expect.stringContaining('no pertenece a COOKIE_DOMAIN')]);
  });
});
