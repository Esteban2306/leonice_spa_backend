import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientsRepository } from './repositories/clients.repository';
import { ResolveClientDto } from './dto/resolve-client.dto';
import { normalizePhone } from './utils/normalize-phone.util';
import { UpdateClientDto } from './dto/update-client.dto';
import { clientsHistoryRepository } from './repositories/client-history.repository';
import { ConsentService } from './consent/consent.service';

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
        throw new BadRequestException(
          'Nombre y fecha de nacimiento son obligatorios para un cliente nuevo',
        );
      }

      if (hasSensitiveInput) {
        this.consentService.assertValidConsent(dto.consent);
      }

      const created = await this.repository.create({
        phone: normalizedPhone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
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

  async search(query?: string) {
    if (!query || query.trim() === '') {
      throw new BadRequestException(
        'Escribe al menos 2 caracteres para buscar',
      );
    }

    return this.repository.searchByName(query.trim());
  }

  async getDetail(id: string) {
    const client = await this.repository.findById(id);
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const history = await this.historyRepository.getReservationHistory(id);
    return { ...client, ...history };
  }

  async update(id: string, dto: UpdateClientDto) {
    const existing = await this.repository.findById(id);

    if (!existing) throw new NotFoundException('Cliente no encontrado');

    if (dto.allergies !== undefined || dto.isPregnant !== undefined) {
      const alreadyConsented =
        await this.consentService.hasHealthDataConsent(id);
      if (!alreadyConsented) {
        throw new BadRequestException(
          'Este cliente no tiene consentimiento de datos de salud registrado — regístralo antes de guardar esta información',
        );
      }
    }

    return this.repository.update(id, {
      name: dto.name,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      allergies: dto.allergies,
      isPregnant: dto.isPregnant,
      hairLength: dto.hairLength,
      hairColor: dto.hairColor,
    });
  }
}
