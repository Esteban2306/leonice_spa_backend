import {
  Body,
  Controller,
  NotFoundException,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConduitToolAuthGuard } from './guards/conduit-tool-auth.guard';
import { IdempotencyInterceptor } from 'src/common/idempotency/idempotency.interceptor';
import { ClientsRepository } from 'src/clients/repositories/clients.repository';
import { ClientsService } from 'src/clients/clients.service';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';
import { ConduitUpdateClientDto } from './dto/conduit-update-client.dto';
import { ConsentService } from 'src/clients/consent/consent.service';

@Controller({ path: 'conduit/clients', version: '1' })
@UseGuards(ConduitToolAuthGuard)
export class ConduitToolsController {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly clientsService: ClientsService,
    private readonly consentService: ConsentService,
  ) {}

  @UseInterceptors(IdempotencyInterceptor)
  @Patch()
  async update(@Body() dto: ConduitUpdateClientDto) {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(dto.phone),
    );
    if (!client)
      throw new NotFoundException(
        'No existe ningún cliente registrado con este número',
      );

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
