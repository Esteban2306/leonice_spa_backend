import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokenCircuitError } from 'cockatiel';
import {
  conduitSendPolicy,
  conduitEventPushPolicy,
} from '../resilience/conduit-resilience.policy';
import { signConduitEvent } from '../../common/conduit-security/sign-conduit-event';

export interface SendWhatsappMessageParams {
  phone: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface SendResult {
  delivered: boolean;
}

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
      await conduitSendPolicy.execute(() =>
        this.post('/api/v1/messages', {
          recipient: { channel: 'WHATSAPP', address: params.phone },
          connectionId,
          template: { id: params.templateId },
          variables: params.variables,
        }),
      );
      return { delivered: true };
    } catch (error) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(
          `Mensaje a ${params.phone} no enviado: circuito abierto`,
        );
        return { delivered: false };
      }
      this.logger.warn(
        `Mensaje a ${params.phone} no enviado: ${(error as Error).message}`,
      );
      return { delivered: false };
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
        throw new Error(
          `Conduit respondió ${res.status} al recibir "${params.eventType}": ${await res.text()}`,
        );
      }
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Conduit respondió ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }
}
