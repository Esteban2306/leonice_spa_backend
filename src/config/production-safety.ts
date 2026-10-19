import { parseCorsOrigins } from './cors';

const MIN_SECRET_LENGTH = 32;
const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const PLACEHOLDER_PATTERN =
  /pendiente|changeme|change-me|cambiar|replace|placeholder|example|ejemplo|todo|xxxx|password|contrase/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CONDUIT_TOOL_API_KEY',
  'CONDUIT_WEBHOOK_SECRET',
] as const;

type RawEnv = Record<string, unknown>;

const text = (env: RawEnv, name: string): string | undefined => {
  const value = env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export function encryptionKeyIssues(env: RawEnv): string[] {
  const key = text(env, 'ENCRYPTION_KEY');
  if (key !== undefined && !ENCRYPTION_KEY_PATTERN.test(key)) {
    return [
      'ENCRYPTION_KEY debe tener exactamente 64 caracteres hexadecimales',
    ];
  }
  return [];
}

function corsIssues(env: RawEnv): string[] {
  const origins = parseCorsOrigins(text(env, 'CORS_ORIGIN'));
  const issues: string[] = [];
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      issues.push(`CORS_ORIGIN contiene un origen inválido: ${origin}`);
      continue;
    }
    if (url.protocol !== 'https:') {
      issues.push(`CORS_ORIGIN debe usar https en producción: ${origin}`);
    }
    if (LOCAL_HOSTS.has(url.hostname)) {
      issues.push(`CORS_ORIGIN no puede apuntar a localhost en producción`);
    }
  }
  return issues;
}

function secretIssues(env: RawEnv): string[] {
  const issues: string[] = [];
  for (const name of REQUIRED_SECRETS) {
    const value = text(env, name);
    if (value === undefined) {
      issues.push(`${name} es obligatoria en producción`);
      continue;
    }
    if (value.length < MIN_SECRET_LENGTH) {
      issues.push(
        `${name} debe tener al menos ${MIN_SECRET_LENGTH} caracteres en producción`,
      );
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      issues.push(`${name} parece un valor de plantilla: genera uno real`);
    }
  }
  const access = text(env, 'JWT_SECRET');
  if (access !== undefined && access === text(env, 'JWT_REFRESH_SECRET')) {
    issues.push('JWT_SECRET y JWT_REFRESH_SECRET deben ser distintos');
  }
  return issues;
}

export function productionIssues(env: RawEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const issues = [...secretIssues(env), ...corsIssues(env)];
  if (text(env, 'CONDUIT_WEBHOOK_ALLOW_LEGACY_SIGNATURE') === 'true') {
    issues.push(
      'CONDUIT_WEBHOOK_ALLOW_LEGACY_SIGNATURE no se permite en producción',
    );
  }
  return issues;
}
