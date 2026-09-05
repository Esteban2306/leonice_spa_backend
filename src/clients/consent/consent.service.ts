import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { ConsentRecordRepository } from './consent-record.repository';

export interface ConsentInput {
  accepted: boolean;
  policyVersion: string;
}

@Injectable()
export class ConsentService {
  constructor(private readonly repository: ConsentRecordRepository) {}

  hasConsent(clientId: string, type: ConsentType): Promise<boolean> {
    return this.repository.hasAnyOfType(clientId, type);
  }

  assertValidConsentInput(
    consent: ConsentInput | undefined,
    type: ConsentType,
  ): void {
    if (!consent?.accepted || !consent.policyVersion) {
      throw new BadRequestException(
        `Se requiere consentimiento explícito de tipo ${type} antes de continuar`,
      );
    }
  }

  recordConsent(
    clientId: string,
    type: ConsentType,
    policyVersion: string,
    ipAddress?: string,
  ) {
    return this.repository.create(clientId, type, policyVersion, ipAddress);
  }

  async ensureConsent(
    clientId: string,
    type: ConsentType,
    consent?: ConsentInput,
    ipAddress?: string,
  ): Promise<void> {
    const already = await this.hasConsent(clientId, type);
    if (already) return;

    this.assertValidConsentInput(consent, type);
    await this.recordConsent(clientId, type, consent!.policyVersion, ipAddress);
  }

  hasHealthDataConsent(clientId: string): Promise<boolean> {
    return this.hasConsent(clientId, ConsentType.DATOS_SALUD);
  }

  assertValidConsent(consent?: {
    healthDataConsent: boolean;
    policyVersion: string;
  }): void {
    this.assertValidConsentInput(
      consent
        ? {
            accepted: consent.healthDataConsent,
            policyVersion: consent.policyVersion,
          }
        : undefined,
      ConsentType.DATOS_SALUD,
    );
  }

  recordHealthDataConsent(
    clientId: string,
    policyVersion: string,
    ipAddress?: string,
  ) {
    return this.recordConsent(
      clientId,
      ConsentType.DATOS_SALUD,
      policyVersion,
      ipAddress,
    );
  }

  async hasMarketingConsent(clientId: string): Promise<boolean> {
    return this.repository.hasAnyOfType(clientId, ConsentType.MARKETING);
  }

  async ensureHealthDataConsent(
    clientId: string,
    consent?: { healthDataConsent: boolean; policyVersion: string },
    ipAddress?: string,
  ): Promise<void> {
    await this.ensureConsent(
      clientId,
      ConsentType.DATOS_SALUD,
      consent
        ? {
            accepted: consent.healthDataConsent,
            policyVersion: consent.policyVersion,
          }
        : undefined,
      ipAddress,
    );
  }

  async ensureMarketingConsent(
    clientId: string,
    consent: ConsentInput,
    ipAddress?: string,
  ): Promise<void> {
    await this.ensureConsent(
      clientId,
      ConsentType.MARKETING,
      consent,
      ipAddress,
    );
  }

  hasTermsConsent(clientId: string): Promise<boolean> {
    return this.hasConsent(clientId, ConsentType.TERMINOS_SERVICIO);
  }

  async ensureTermsConsent(
    clientId: string,
    consent: ConsentInput,
    ipAddress?: string,
  ): Promise<void> {
    await this.ensureConsent(
      clientId,
      ConsentType.TERMINOS_SERVICIO,
      consent,
      ipAddress,
    );
  }
}
