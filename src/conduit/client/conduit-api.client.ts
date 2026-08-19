import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokenCircuitError } from 'cockatiel';
import { conduitSendPolicy } from '../resilience/conduit-resilience.policy';

export interface SendWhatsappMessageParams {
  phone: string;
  templateName: string;
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
    try {
      await conduitSendPolicy.execute(() =>
        this.post('/messages/send', params),
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Conduit respondió ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }
}
