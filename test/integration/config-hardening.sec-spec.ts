import 'reflect-metadata';
import { validateEnv } from 'src/config/env.validation';

const base = (): Record<string, unknown> => ({
  NODE_ENV: 'production',
  PORT: '3920',
  DATABASE_URL: 'postgresql://u:p@db:5432/x',
  REDIS_URL: 'redis://redis:6379',
  JWT_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  CORS_ORIGIN: 'https://leonicespa.com,https://admin.leonicespa.com',
  CONDUIT_TOOL_API_KEY: 'c'.repeat(64),
  CONDUIT_WEBHOOK_SECRET: 'd'.repeat(64),
  ENCRYPTION_KEY: 'e'.repeat(64),
});

describe('S4/S6. Configuración de producción: el arranque falla ante configuraciones inseguras', () => {
  it('una configuración de producción correcta es válida', () => {
    expect(() => validateEnv(base())).not.toThrow();
  });

  it.each([
    ['DATABASE_URL'],
    ['REDIS_URL'],
    ['JWT_SECRET'],
    ['CORS_ORIGIN'],
    ['ENCRYPTION_KEY'],
  ])('falta %s: el arranque falla', (name) => {
    const env = base();
    delete env[name];
    expect(() => validateEnv(env)).toThrow();
  });

  it('ENCRYPTION_KEY debe tener exactamente 64 caracteres hexadecimales', () => {
    expect(() =>
      validateEnv({ ...base(), ENCRYPTION_KEY: 'zz'.repeat(32) }),
    ).toThrow();
    expect(() =>
      validateEnv({ ...base(), ENCRYPTION_KEY: 'ab'.repeat(16) }),
    ).toThrow();
  });

  it.each([
    ['JWT_REFRESH_SECRET'],
    ['CONDUIT_TOOL_API_KEY'],
    ['CONDUIT_WEBHOOK_SECRET'],
  ])(
    'en producción %s es obligatoria (si falta, el arranque falla en vez de fallar en la primera petición)',
    (name) => {
      const env = base();
      delete env[name];
      expect(() => validateEnv(env)).toThrow();
    },
  );

  it.each([
    ['JWT_SECRET'],
    ['JWT_REFRESH_SECRET'],
    ['CONDUIT_TOOL_API_KEY'],
    ['CONDUIT_WEBHOOK_SECRET'],
  ])('en producción %s corta (menos de 32 caracteres) se rechaza', (name) => {
    expect(() => validateEnv({ ...base(), [name]: 'corta123' })).toThrow();
  });

  it('en producción JWT_SECRET y JWT_REFRESH_SECRET no pueden ser iguales', () => {
    expect(() =>
      validateEnv({ ...base(), JWT_REFRESH_SECRET: 'a'.repeat(64) }),
    ).toThrow();
  });

  it('en producción CORS_ORIGIN no puede incluir localhost ni orígenes http sin TLS', () => {
    expect(() =>
      validateEnv({ ...base(), CORS_ORIGIN: 'http://localhost:3000' }),
    ).toThrow();
    expect(() =>
      validateEnv({ ...base(), CORS_ORIGIN: 'http://leonicespa.com' }),
    ).toThrow();
  });

  it('en producción no se permite la firma antigua V1 del webhook', () => {
    expect(() =>
      validateEnv({
        ...base(),
        CONDUIT_WEBHOOK_ALLOW_LEGACY_SIGNATURE: 'true',
      }),
    ).toThrow();
  });

  it('los valores de plantilla (placeholders) se rechazan en producción', () => {
    expect(() =>
      validateEnv({
        ...base(),
        CONDUIT_TOOL_API_KEY: 'pendiente-configurar'.padEnd(40, 'x'),
      }),
    ).toThrow();
    expect(() =>
      validateEnv({ ...base(), JWT_SECRET: 'changeme'.repeat(8) }),
    ).toThrow();
  });
});
