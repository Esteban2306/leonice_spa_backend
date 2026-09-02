import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { ConsentRecordRepository } from './consent-record.repository';

interface HealthDataConsentInput {
  healthDataConsent: boolean;
  policyVersion: string;
}

@Injectable()
export class ConsentService {
  constructor(private readonly repository: ConsentRecordRepository) {}

  async hasHealthDataConsent(clientId: string): Promise<boolean> {
    return this.repository.hasAnyOfType(clientId, ConsentType.DATOS_SALUD);
  }

  assertValidConsent(consent?: HealthDataConsentInput): void {
    if (!consent?.healthDataConsent || !consent.policyVersion) {
      throw new BadRequestException(
        'Se requiere consentimiento explícito antes de guardar datos de salud',
      );
    }
  }

  async hasMarketingConsent(clientId: string): Promise<boolean> {
    return this.repository.hasAnyOfType(clientId, ConsentType.MARKETING);
  }

  async recordHealthDataConsent(
    clientId: string,
    policyVersion: string,
    ipAddress?: string,
  ) {
    return this.repository.create(
      clientId,
      ConsentType.DATOS_SALUD,
      policyVersion,
      ipAddress,
    );
  }

  async ensureHealthDataConsent(
    clientId: string,
    consent?: HealthDataConsentInput,
    ipAddress?: string,
  ): Promise<void> {
    const alreadyConsented = await this.hasHealthDataConsent(clientId);
    if (alreadyConsented) return;

    this.assertValidConsent(consent);
    await this.recordHealthDataConsent(
      clientId,
      consent!.policyVersion,
      ipAddress,
    );
  }
}
