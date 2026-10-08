import { Injectable } from '@nestjs/common';
import { ClientsRepository } from './repositories/clients.repository';
import { ResolveClientDto } from './dto/resolve-client.dto';
import { normalizePhone } from './utils/normalize-phone.util';
import { UpdateClientDto } from './dto/update-client.dto';
import { clientsHistoryRepository } from './repositories/client-history.repository';
import { ConsentService } from './consent/consent.service';
import { SetHairProfileDto } from './dto/set-hair-profile.dto';
import {
  getHairProfileStatus,
  hairProfileExpiryCutoff,
  toHairProfileView,
} from './domain/hair-profile.util';
import { CreateClientDto } from './dto/create-client.dto';
import { RecordConsentDto } from './dto/record-consent.dto';
import { AppException } from '../common/errors/app.exception';
import { calendarDateToUtcMidnight } from '../common/validation/date-input.validators';
import { getDayBoundaries } from '../reservations/domain/day-boundaries';
import {
  ClientDetailView,
  ClientView,
  computeReservationStats,
  toClientReservationSummary,
  toClientView,
} from './domain/client-view';

const MIN_NAME_QUERY = 2;
const MIN_PHONE_DIGITS = 4;

@Injectable()
export class ClientsService {
  constructor(
    private readonly repository: ClientsRepository,
    private readonly historyRepository: clientsHistoryRepository,
    private readonly consentService: ConsentService,
  ) {}

  async resolveOrCreateForBooking(dto: ResolveClientDto) {
    const normalizedPhone = normalizePhone(dto.phone);

    let client = dto.whatsappJid
      ? await this.repository.findByWhatsappJid(dto.whatsappJid)
      : null;

    if (!client) {
      client = await this.repository.findByPhone(normalizedPhone);
    }

    const hasSensitiveInput =
      dto.allergies !== undefined || dto.isPregnant !== undefined;

    if (!client) {
      if (!dto.name || !dto.birthDate) {
        throw new AppException('CLIENT_REQUIRED_FIELDS', {
          details: {
            missing: [
              ...(dto.name ? [] : ['name']),
              ...(dto.birthDate ? [] : ['birthDate']),
            ],
          },
        });
      }

      if (hasSensitiveInput) {
        this.consentService.assertValidConsent(dto.consent);
      }

      const created = await this.repository.create({
        phone: normalizedPhone,
        name: dto.name,
        birthDate: calendarDateToUtcMidnight(dto.birthDate),
        whatsappJid: dto.whatsappJid,
        allergies: dto.allergies,
        isPregnant: dto.isPregnant || false,
      });

      if (hasSensitiveInput) {
        await this.consentService.recordHealthDataConsent(
          created.id,
          dto.consent!.policyVersion,
        );
      }
      return created;
    }

    if (hasSensitiveInput) {
      await this.consentService.ensureHealthDataConsent(client.id, dto.consent);
    }

    return this.repository.fillMissingFields(client, {
      whatsappJid: dto.whatsappJid,
      allergies: dto.allergies,
      isPregnant: dto.isPregnant,
    });
  }

  async search(query?: string, page = 1, pageSize = 20) {
    const term = query?.trim() ?? '';
    const phoneDigits = term.replace(/\D/g, '');
    const searchesPhone = phoneDigits.length >= MIN_PHONE_DIGITS;
    const searchesName =
      term.length >= MIN_NAME_QUERY && !/^[\d\s+()-]+$/.test(term);
    if (term.length > 0 && !searchesPhone && !searchesName) {
      throw new AppException('CLIENT_SEARCH_TOO_SHORT');
    }

    const result = await this.repository.search(
      {
        name: searchesName ? term : undefined,
        phoneDigits: searchesPhone ? phoneDigits : undefined,
      },
      page,
      pageSize,
    );

    const now = new Date();
    return {
      data: result.data.map((client) => ({
        id: client.id,
        name: client.name,
        phone: client.phone,
        createdAt: client.createdAt,
        reservationCount: client._count.reservations,
        lastReservation: client.reservations[0] ?? null,
        hairProfileStatus: getHairProfileStatus(client, now),
      })),
      pagination: result.pagination,
    };
  }

  async createByAdmin(dto: CreateClientDto): Promise<ClientView> {
    const phone = normalizePhone(dto.phone);
    const existing = await this.repository.findByPhone(phone);
    if (existing) {
      throw new AppException('CLIENT_ALREADY_EXISTS', {
        details: { clientId: existing.id },
      });
    }

    const hasSensitiveInput =
      dto.allergies !== undefined || dto.isPregnant !== undefined;
    if (hasSensitiveInput && !dto.healthDataPolicyVersion) {
      throw new AppException('CLIENT_HEALTH_CONSENT_REQUIRED');
    }

    const created = await this.repository.create({
      phone,
      name: dto.name,
      birthDate: calendarDateToUtcMidnight(dto.birthDate),
      allergies: dto.allergies,
      isPregnant: dto.isPregnant ?? false,
    });

    if (hasSensitiveInput && dto.healthDataPolicyVersion) {
      await this.consentService.recordHealthDataConsent(
        created.id,
        dto.healthDataPolicyVersion,
      );
    }
    return toClientView(created);
  }

  async recordConsent(id: string, dto: RecordConsentDto) {
    await this.requireClient(id);
    await this.consentService.ensureConsent(id, dto.type, {
      accepted: true,
      policyVersion: dto.policyVersion,
    });
    return this.getDetail(id);
  }

  async getDetail(id: string): Promise<ClientDetailView> {
    const client = await this.requireClient(id);
    const now = new Date();
    const history = await this.historyRepository.getReservationHistory(id, now);
    return {
      ...toClientView(client, now),
      stats: computeReservationStats(history.statusCounts, history.upcoming),
      reservations: history.reservations.map(toClientReservationSummary),
      consents: history.consentRecords,
    };
  }

  async setHairProfile(id: string, dto: SetHairProfileDto) {
    await this.requireClient(id);
    const updated = await this.repository.setHairProfile(
      id,
      { hairLength: dto.hairLength, hairColor: dto.hairColor },
      new Date(),
    );
    return toHairProfileView(updated);
  }

  async confirmHairProfile(id: string) {
    await this.requireClient(id);
    const renewed = await this.repository.renewHairProfileIfComplete(
      id,
      new Date(),
    );
    if (!renewed) {
      throw new AppException('HAIR_PROFILE_MISSING', {
        details: { clientId: id },
      });
    }
    const client = await this.requireClient(id);
    return toHairProfileView(client);
  }

  async findPendingHairProfiles(page: number, pageSize: number) {
    const now = new Date();
    const { clients, total } = await this.repository.findPendingHairProfiles({
      upcomingFrom: getDayBoundaries(now).dayStart,
      expiredBefore: hairProfileExpiryCutoff(now),
      page,
      pageSize,
    });

    return {
      data: clients.map((client) => ({
        clientId: client.id,
        name: client.name,
        phone: client.phone,
        hairProfile: toHairProfileView(client, now),
        nextReservation: client.reservations[0]
          ? {
              reservationId: client.reservations[0].id,
              scheduledStart: client.reservations[0].scheduledStart,
              status: client.reservations[0].status,
              treatment: client.reservations[0].treatment.name,
            }
          : null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private async requireClient(id: string) {
    const client = await this.repository.findById(id);
    if (!client) {
      throw new AppException('CLIENT_NOT_FOUND', { details: { clientId: id } });
    }
    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientView> {
    await this.requireClient(id);

    if (dto.allergies !== undefined || dto.isPregnant !== undefined) {
      const alreadyConsented =
        await this.consentService.hasHealthDataConsent(id);
      if (!alreadyConsented) {
        throw new AppException('CLIENT_HEALTH_CONSENT_REQUIRED', {
          details: { clientId: id },
        });
      }
    }

    const updated = await this.repository.update(id, {
      name: dto.name,
      birthDate: dto.birthDate
        ? calendarDateToUtcMidnight(dto.birthDate)
        : undefined,
      allergies: dto.allergies,
      isPregnant: dto.isPregnant,
    });
    return toClientView(updated);
  }
}
