import { Injectable, Logger } from '@nestjs/common';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { normalizePhone } from '../../clients/utils/normalize-phone.util';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { EventBusService } from '../../common/events/event.service';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import { describeReceiptReasons } from './receipt-reason-labels';

/** Rechazos seguidos de una misma clienta antes de avisar al equipo. */
export const RECEIPT_RETRIES_THRESHOLD = 2;
const ATTEMPTS_TTL_SECONDS = 24 * 60 * 60;
const SEEN_TTL_SECONDS = 24 * 60 * 60;

export interface ReceiptContact {
  phone: string | null;
  key: string;
}

export function parseReceiptContact(
  contact: string | null | undefined,
): ReceiptContact | null {
  if (!contact) return null;
  const isLid = contact.endsWith('@lid');
  const digits = contact.replace(/\D/g, '');
  if (!digits) return null;
  return isLid
    ? { phone: null, key: `lid:${digits}` }
    : { phone: normalizePhone(digits), key: digits };
}

@Injectable()
export class ReceiptAlertsService {
  private readonly logger = new Logger(ReceiptAlertsService.name);

  constructor(
    private readonly cache: SafeCacheService,
    private readonly clients: ClientsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  /** Un comprobante quedó pendiente de que una persona lo revise. */
  async review(
    contact: ReceiptContact,
    verificationId: string,
    reasonCodes: readonly string[],
  ): Promise<void> {
    await this.publish('REVIEW', contact, verificationId, 1, reasonCodes);
  }

  /**
   * Cuenta un comprobante rechazado. Avisa solo al llegar al umbral, una
   * vez por racha, y devuelve cuántos van seguidos.
   */
  async invalid(
    contact: ReceiptContact,
    verificationId: string,
    reasonCodes: readonly string[],
  ): Promise<number> {
    const key = this.attemptsKey(contact);
    const attempts = ((await this.cache.get<number>(key)) ?? 0) + 1;
    await this.cache.set(key, attempts, ATTEMPTS_TTL_SECONDS);
    if (attempts === RECEIPT_RETRIES_THRESHOLD) {
      await this.publish(
        'RETRIES',
        contact,
        verificationId,
        attempts,
        reasonCodes,
      );
    }
    return attempts;
  }

  /** Un comprobante bueno corta la racha. */
  async valid(contact: ReceiptContact): Promise<void> {
    await this.cache.delete(this.attemptsKey(contact));
  }

  /** La entrega de Conduit es al menos una vez: true si ya se procesó. */
  async alreadySeen(eventId: string | undefined): Promise<boolean> {
    if (!eventId) return false;
    const reserved = await this.cache.setIfAbsent(
      `conduit:verification-event:${eventId}`,
      true,
      SEEN_TTL_SECONDS,
    );
    return reserved === false;
  }

  private attemptsKey(contact: ReceiptContact): string {
    return `receipt:invalid:${contact.key}`;
  }

  private async publish(
    kind: 'REVIEW' | 'RETRIES',
    contact: ReceiptContact,
    verificationId: string,
    attempts: number,
    reasonCodes: readonly string[],
  ): Promise<void> {
    try {
      const client = contact.phone
        ? await this.clients.findByPhone(contact.phone)
        : null;
      await this.eventBus.publishAsync(EVENT_TYPES.CONDUIT_RECEIPT_ISSUE, {
        kind,
        phone: contact.phone,
        clientName: client?.name ?? null,
        reason: describeReceiptReasons(reasonCodes),
        attempts,
        verificationId,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar del comprobante ${verificationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
