import {
  Body,
  Controller,
  NotFoundException,
  Post,
  Patch,
  UseGuards,
  UseInterceptors,
  ConflictException,
} from '@nestjs/common';
import { ConduitToolAuthGuard } from './guards/conduit-tool-auth.guard';
import { IdempotencyInterceptor } from 'src/common/idempotency/idempotency.interceptor';
import { ClientsRepository } from 'src/clients/repositories/clients.repository';
import { ClientsService } from 'src/clients/clients.service';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';
import { ConduitUpdateClientDto } from './dto/conduit-update-client.dto';
import { ConduitCreateClientDto } from './dto/conduit-create-client.dto';
import { ConsentService } from 'src/clients/consent/consent.service';

@Controller({ path: 'conduit/clients', version: '1' })
@UseGuards(ConduitToolAuthGuard)
export class ConduitToolsController {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly clientsService: ClientsService,
    private readonly consentService: ConsentService,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async createOrUpdate(@Body() dto: ConduitCreateClientDto) {
    const normalizedPhone = normalizePhone(dto.phone);

    let client = dto.whatsappJid
      ? await this.clientsRepository.findByWhatsappJid(dto.whatsappJid)
      : null;

    if (!client) {
      client = await this.clientsRepository.findByPhone(normalizedPhone);
    }

    if (!client) {
      if (!dto.name || !dto.birthDate) {
        throw new ConflictException(
          'Para crear un nuevo cliente se requieren nombre y fecha de nacimiento',
        );
      }

      const hasSensitiveInput =
        dto.allergies !== undefined || dto.isPregnant !== undefined;
      if (hasSensitiveInput) {
        const healthConsent = dto.consents?.find(
          (c) => c.type === 'DATOS_SALUD',
        );
        if (!healthConsent?.accepted) {
          throw new ConflictException(
            'Se requiere consentimiento explícito para datos de salud (DATOS_SALUD) antes de guardar alergias o estado de embarazo',
          );
        }
      }

      client = await this.clientsRepository.create({
        phone: normalizedPhone,
        name: dto.name,
        birthDate: new Date(dto.birthDate),
        whatsappJid: dto.whatsappJid,
        allergies: dto.allergies,
        isPregnant: dto.isPregnant || false,
        hairLength: dto.hairLength,
        hairColor: dto.hairColor,
      });

      // Registrar consentimientos
      for (const c of dto.consents ?? []) {
        if (c.accepted) {
          await this.consentService.recordConsent(
            client.id,
            c.type,
            c.policyVersion,
          );
        }
      }

      return client;
    }

    for (const c of dto.consents ?? []) {
      await this.consentService.ensureConsent(client.id, c.type, {
        accepted: c.accepted,
        policyVersion: c.policyVersion,
      });
    }

    if (dto.allergies !== undefined) {
      await this.consentService.ensureHealthDataConsent(client.id);
    }

    const {
      phone: _phone,
      whatsappJid: _jid,
      name: _name,
      birthDate: _birthDate,
      ...updates
    } = dto;
    return this.clientsService.update(client.id, updates);
  }

  @UseInterceptors(IdempotencyInterceptor)
  @Patch()
  async update(@Body() dto: ConduitUpdateClientDto) {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(dto.phone),
    );
    if (!client) {
      throw new NotFoundException(
        'No existe ningún cliente registrado con este número',
      );
    }

    for (const c of dto.consents ?? []) {
      await this.consentService.ensureConsent(client.id, c.type, {
        accepted: c.accepted,
        policyVersion: c.policyVersion,
      });
    }

    if (dto.allergies !== undefined) {
      await this.consentService.ensureHealthDataConsent(client.id);
    }

    const { phone: _phone, ...updates } = dto;
    return this.clientsService.update(client.id, updates);
  }
}
