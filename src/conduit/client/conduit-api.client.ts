import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokenCircuitError } from 'cockatiel';
import {
  ConduitPermanentError,
  conduitSendPolicy,
  conduitEventPushPolicy,
} from '../resilience/conduit-resilience.policy';
import { signConduitEvent } from '../../common/conduit-security/sign-conduit-event';

export interface SendWhatsappMessageParams {
  phone: string;
  templateId: string;
  variables: Record<string, string>;
  /**
   * Estable entre reintentos del mismo envío (p. ej. derivada del job). Con
   * ella Conduit devuelve el mensaje original en vez de enviar otro.
   */
  idempotencyKey: string;
  /** Viaja de vuelta en los webhooks de estado (`meta.companyEventId`). */
  companyEventId?: string;
}

/** Contexto del job que origina el envío; estable entre reintentos. */
export interface ConduitSendContext {
  idempotencyKey: string;
  companyEventId?: string;
}

export interface SendResult {
  delivered: boolean;
  /** true si Conduit rechazó el envío por su contenido: no reintentar. */
  permanent?: boolean;
  reason?: string;
  messageId?: string;
}

/** Error de Conduit en una operación administrativa (panel). */
export class ConduitAdminError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ConduitAdminError';
  }
}

export type AdminQuery = Record<string, string | number | boolean | undefined>;

/** 4xx que sí son transitorios. */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 409, 425, 429]);

@Injectable()
export class ConduitApiClient {
  private readonly logger = new Logger(ConduitApiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>(
      'CONDUIT_BASE_URL',
      'http://localhost:4123',
    );
    this.apiKey = this.config.get<string>(
      'CONDUIT_API_KEY',
      'pendiente-configurar',
    );
  }

  async sendWhatsappMessage(
    params: SendWhatsappMessageParams,
  ): Promise<SendResult> {
    const connectionId = this.config.getOrThrow<string>(
      'CONDUIT_WHATSAPP_CONNECTION_ID',
    );

    try {
      const response = await conduitSendPolicy.execute(() =>
        this.post<{ messageId?: string }>(
          '/api/v1/messages',
          {
            recipient: { channel: 'WHATSAPP', address: params.phone },
            connectionId,
            template: { id: params.templateId },
            variables: params.variables,
            ...(params.companyEventId
              ? { meta: { companyEventId: params.companyEventId } }
              : {}),
          },
          { 'Idempotency-Key': params.idempotencyKey },
        ),
      );
      return { delivered: true, messageId: response.messageId };
    } catch (error) {
      if (error instanceof ConduitPermanentError) {
        this.logger.error(
          `Conduit rechazó el mensaje a ${params.phone} (${error.status}): ${error.message}`,
        );
        return { delivered: false, permanent: true, reason: error.message };
      }
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(
          `Mensaje a ${params.phone} no enviado: circuito abierto`,
        );
        return { delivered: false, reason: 'circuito abierto' };
      }
      this.logger.warn(
        `Mensaje a ${params.phone} no enviado: ${(error as Error).message}`,
      );
      return { delivered: false, reason: (error as Error).message };
    }
  }

  async pushBusinessEvent(params: {
    eventType: string;
    eventId: string;
    payload: unknown;
  }): Promise<void> {
    const integrationId = this.config.getOrThrow<string>(
      'CONDUIT_INTEGRATION_ID',
    );
    const integrationSecret = this.config.getOrThrow<string>(
      'CONDUIT_INTEGRATION_SECRET',
    );
    const botId = this.config.getOrThrow<string>('CONDUIT_DEFAULT_BOT_ID');

    const signed = signConduitEvent({
      payload: params.payload,
      integrationId,
      integrationSecret,
      eventId: params.eventId,
    });
    const url = `${this.baseUrl}/api/v1/api/external-data/${botId}/webhook/${params.eventType}`;

    await conduitEventPushPolicy.execute(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      });
      if (!res.ok) {
        throw this.httpError(
          res.status,
          `Conduit respondió ${res.status} al recibir "${params.eventType}": ${await res.text()}`,
        );
      }
    });
  }

  /**
   * Llamada administrativa a Conduit en nombre del panel. Sin reintentos
   * (las operaciones del panel las repite la persona si hace falta) y con
   * timeout corto para no colgar la interfaz.
   */
  async admin<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { query?: AdminQuery; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`/api/v1/${path.replace(/^\/+/, '')}`, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          ...(options.body !== undefined && {
            'Content-Type': 'application/json',
          }),
        },
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ConduitAdminError(
        null,
        `Conduit no respondió: ${(error as Error).message}`,
      );
    }

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const message =
        (body as { message?: string | string[] } | null)?.message ??
        `HTTP ${res.status}`;
      throw new ConduitAdminError(
        res.status,
        Array.isArray(message) ? message.join('; ') : String(message),
      );
    }
    return body as T;
  }

  private async post<T>(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw this.httpError(
        res.status,
        `Conduit respondió ${res.status}: ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private httpError(status: number, message: string): Error {
    const isPermanent =
      status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status);
    return isPermanent
      ? new ConduitPermanentError(message, status)
      : new Error(message);
  }
}
