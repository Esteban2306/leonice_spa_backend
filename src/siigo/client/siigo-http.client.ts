import { Logger } from '@nestjs/common';
import { SiigoSettings } from '../siigo.config';
import {
  SiigoCatalogItem,
  SiigoClient,
  SiigoVoucherBody,
  SiigoVoucherResult,
} from './siigo.client';
import { SiigoError, siigoErrorFromResponse } from './siigo.errors';

const TOKEN_SAFETY_MARGIN_MS = 5 * 60_000;
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60_000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

type Query = Record<string, string | number | boolean | undefined>;

export class SiigoHttpClient implements SiigoClient {
  private readonly logger = new Logger(SiigoHttpClient.name);
  private token: CachedToken | null = null;
  private authInFlight: Promise<string> | null = null;

  constructor(private readonly settings: SiigoSettings) {}

  async createVoucher(
    body: SiigoVoucherBody,
    idempotencyKey: string,
  ): Promise<SiigoVoucherResult> {
    const raw = await this.request('POST', '/v1/vouchers', {
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    const record = asRecord(raw);
    const id = record.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new SiigoError(
        'UNKNOWN',
        'Siigo respondió sin identificador del recibo',
      );
    }
    return {
      id: String(id),
      name: typeof record.name === 'string' ? record.name : null,
      raw: record,
    };
  }

  listDocumentTypes(type: string): Promise<SiigoCatalogItem[]> {
    return this.catalog('/v1/document-types', { type });
  }

  listPaymentTypes(documentType: string): Promise<SiigoCatalogItem[]> {
    return this.catalog('/v1/payment-types', { document_type: documentType });
  }

  listMiscIncomeConcepts(): Promise<SiigoCatalogItem[]> {
    return this.catalog('/v1/misc-income');
  }

  async findProductByCode(code: string): Promise<SiigoCatalogItem | null> {
    const items = await this.catalog('/v1/products', { code });
    return items.find((item) => item.code === code) ?? items[0] ?? null;
  }

  private async catalog(
    path: string,
    query?: Query,
  ): Promise<SiigoCatalogItem[]> {
    const raw = await this.request('GET', path, { query });
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { results?: unknown })?.results)
        ? (raw as { results: unknown[] }).results
        : [];
    return list.map((entry) => toCatalogItem(asRecord(entry)));
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: unknown;
      query?: Query;
      headers?: Record<string, string>;
    } = {},
    retryAuth = true,
  ): Promise<unknown> {
    const token = await this.accessToken();
    const response = await this.send(method, path, token, options);
    if (response.status === 401 && retryAuth) {
      this.token = null;
      return this.request(method, path, options, false);
    }
    return this.unwrap(response);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }
    this.authInFlight ??= this.authenticate().finally(() => {
      this.authInFlight = null;
    });
    return this.authInFlight;
  }

  private async authenticate(): Promise<string> {
    const response = await this.fetchWithTimeout(
      `${this.settings.baseUrl}/auth`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Partner-Id': this.settings.partnerId,
        },
        body: JSON.stringify({
          username: this.settings.username,
          access_key: this.settings.accessKey,
        }),
      },
    );
    const payload = await this.unwrap(response);
    const record = asRecord(payload);
    const value = record.access_token;
    if (typeof value !== 'string' || value === '') {
      throw new SiigoError('AUTH', 'Siigo no entregó un token de acceso');
    }
    const ttl =
      typeof record.expires_in === 'number'
        ? record.expires_in * 1000
        : DEFAULT_TOKEN_TTL_MS;
    this.token = {
      value,
      expiresAt: Date.now() + Math.max(ttl - TOKEN_SAFETY_MARGIN_MS, 0),
    };
    this.logger.log('Token de Siigo renovado');
    return value;
  }

  private send(
    method: 'GET' | 'POST',
    path: string,
    token: string,
    options: {
      body?: unknown;
      query?: Query;
      headers?: Record<string, string>;
    },
  ): Promise<Response> {
    const url = new URL(`${this.settings.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return this.fetchWithTimeout(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Partner-Id': this.settings.partnerId,
        ...options.headers,
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === 'TimeoutError') {
        throw new SiigoError('TIMEOUT', 'Siigo no respondió a tiempo');
      }
      throw new SiigoError(
        'UNAVAILABLE',
        `No se pudo conectar con Siigo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async unwrap(response: Response): Promise<unknown> {
    const text = await response.text();
    let body: unknown = null;
    if (text !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!response.ok) throw siigoErrorFromResponse(response.status, body);
    return body;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function toCatalogItem(record: Record<string, unknown>): SiigoCatalogItem {
  const id = record.id;
  return {
    id: typeof id === 'number' ? id : text(id),
    name: text(record.name),
    code: record.code === undefined ? null : text(record.code),
    active: record.active !== false,
    raw: record,
  };
}
