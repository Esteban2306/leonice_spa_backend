import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConduitTool } from './decorators/conduit-tool.decorator';
import type { RequestWithConduitContact } from './interceptors/conduit-contact.interceptor';
import { ConduitHandoffDto } from './dto/conduit-handoff.dto';
import { BusinessSettingsService } from '../business-settings/business-settings.service';
import { ClientsRepository } from '../clients/repositories/clients.repository';
import { EventBusService } from '../common/events/event.service';
import { EVENT_TYPES } from '../common/events/constants/event.types';
import { normalizePhone } from '../clients/utils/normalize-phone.util';

@Controller({ path: 'conduit', version: '1' })
@ConduitTool()
export class ConduitSupportToolsController {
  constructor(
    private readonly businessSettings: BusinessSettingsService,
    private readonly clients: ClientsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Datos que el bot comunica sin inventar: anticipo (monto e
   * instrucciones de pago), políticas, dirección y horario semanal.
   */
  @Get('business-info')
  businessInfo() {
    return this.businessSettings.forBot();
  }

  /**
   * Pasar la conversación a una persona. Avisa a los admins configurados
   * (plantilla ADMIN_HANDOFF). Conduit pausa el bot en ese chat si la
   * herramienta tiene `pausesBotMinutes`.
   */
  @HttpCode(HttpStatus.OK)
  @Post('handoff')
  async handoff(
    @Body() dto: ConduitHandoffDto,
    @Req() req: RequestWithConduitContact,
    @Headers('x-conduit-idempotency-key') idempotencyKey?: string,
  ) {
    const phone =
      req.conduitContact?.phone ??
      (dto.phone ? normalizePhone(dto.phone) : null);
    const client = phone ? await this.clients.findByPhone(phone) : null;

    this.eventBus.publish(EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED, {
      phone,
      lid: req.conduitContact?.lid ?? null,
      clientName: client?.name ?? null,
      reason: dto.reason,
      summary: dto.summary ?? null,
      requestId: idempotencyKey ?? randomUUID(),
    });

    return {
      handedOff: true,
      message:
        'El equipo fue notificado y responderá por este mismo chat lo antes posible.',
    };
  }
}
