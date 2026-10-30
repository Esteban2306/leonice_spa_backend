import { ConfigService } from '@nestjs/config';
import { SiigoError } from './client/siigo.errors';

export interface SiigoSettings {
  enabled: boolean;
  baseUrl: string;
  username: string;
  accessKey: string;
  partnerId: string;
  timeoutMs: number;
}

const PARTNER_ID_PATTERN = /^[A-Za-z0-9]{3,100}$/;
const DEFAULT_BASE_URL = 'https://api.siigo.com';
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 5_000;

const asBoolean = (value: unknown): boolean =>
  value === true || String(value).toLowerCase() === 'true';

export function readSiigoSettings(config: ConfigService): SiigoSettings {
  const settings: SiigoSettings = {
    enabled: asBoolean(config.get('SIIGO_ENABLED', false)),
    baseUrl: String(config.get('SIIGO_BASE_URL', DEFAULT_BASE_URL)).replace(
      /\/+$/,
      '',
    ),
    username: String(config.get('SIIGO_USERNAME', '')),
    accessKey: String(config.get('SIIGO_ACCESS_KEY', '')),
    partnerId: String(config.get('SIIGO_PARTNER_ID', '')),
    timeoutMs: Number(config.get('SIIGO_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)),
  };
  if (settings.enabled) assertSiigoSettings(settings);
  return settings;
}

export function assertSiigoSettings(settings: SiigoSettings): void {
  const missing = (
    [
      ['SIIGO_USERNAME', settings.username],
      ['SIIGO_ACCESS_KEY', settings.accessKey],
      ['SIIGO_PARTNER_ID', settings.partnerId],
    ] as const
  )
    .filter(([, value]) => value.trim() === '')
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new SiigoError(
      'NOT_CONFIGURED',
      `Siigo está activo pero faltan: ${missing.join(', ')}`,
    );
  }
  if (!PARTNER_ID_PATTERN.test(settings.partnerId)) {
    throw new SiigoError(
      'NOT_CONFIGURED',
      'SIIGO_PARTNER_ID debe tener entre 3 y 100 caracteres alfanuméricos, sin espacios ni símbolos',
    );
  }
  if (
    !Number.isFinite(settings.timeoutMs) ||
    settings.timeoutMs < MIN_TIMEOUT_MS
  ) {
    throw new SiigoError(
      'NOT_CONFIGURED',
      `SIIGO_TIMEOUT_MS debe ser al menos ${MIN_TIMEOUT_MS}`,
    );
  }
  try {
    new URL(settings.baseUrl);
  } catch {
    throw new SiigoError(
      'NOT_CONFIGURED',
      'SIIGO_BASE_URL no es una URL válida',
    );
  }
}
