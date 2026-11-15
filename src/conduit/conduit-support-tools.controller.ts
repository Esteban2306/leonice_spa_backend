import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConduitTool } from './decorators/conduit-tool.decorator';
import {
  ConduitToolOptionsMeta,
  type RequestWithConduitContact,
} from './interceptors/conduit-contact.interceptor';
import { ConduitHandoffDto } from './dto/conduit-handoff.dto';
import { ConduitProductPurchaseDto } from './dto/conduit-product-purchase.dto';
import { BusinessSettingsService } from '../business-settings/business-settings.service';
import { ClientsRepository } from '../clients/repositories/clients.repository';
import { EventBusService } from '../common/events/event.service';
import { EVENT_TYPES } from '../common/events/constants/event.types';
import { normalizePhone } from '../clients/utils/normalize-phone.util';
import { ProductCatalogService } from '../products/catalog/product-catalog.service';
import { toBotProducts } from './tools/bot-product-view';

@Controller({ path: 'conduit', version: '1' })
@ConduitTool()
export class ConduitSupportToolsController {
  constructor(
    private readonly businessSettings: BusinessSettingsService,
    private readonly clients: ClientsRepository,
    private readonly eventBus: EventBusService,
    private readonly productCatalog: ProductCatalogService,
  ) {}

  /**
   * Datos que el bot comunica sin inventar: anticipo (monto e
   * instrucciones de pago), políticas, dirección y horario semanal.
   */
  @ConduitToolOptionsMeta({ publicData: true })
  @Get('business-info')
  businessInfo() {
    return this.businessSettings.forBot();
  }

  /**
   * Productos del catálogo con precio por presentación. Solo lectura: no hay
   * inventario, así que la disponibilidad es "está en el catálogo".
   */
  @ConduitToolOptionsMeta({ publicData: true })
  @Get('products')
  async products(@Query('query') query?: string) {
    const catalog = await this.productCatalog.listRecords();
    return toBotProducts(catalog, query?.slice(0, 80));
  }

  /**
   * La clienta quiere comprar un producto: se avisa a los administradores con
   * su número y lo que pidió. No pausa el asistente: sigue atendiendo el chat.
   */
  @HttpCode(HttpStatus.OK)
  @Post('products/purchase-request')
  async productPurchaseRequest(
    @Body() dto: ConduitProductPurchaseDto,
    @Req() req: RequestWithConduitContact,
    @Headers('x-conduit-idempotency-key') idempotencyKey?: string,
  ) {
    const phone =
      req.conduitContact?.phone ??
      (dto.phone ? normalizePhone(dto.phone) : null);
    const client = phone ? await this.clients.findByPhone(phone) : null;

    const results = await this.eventBus.publishAsync(
      EVENT_TYPES.CONDUIT_PRODUCT_PURCHASE_REQUESTED,
      {
        phone,
        lid: req.conduitContact?.lid ?? null,
        clientName: client?.name ?? null,
        request: dto.request,
        notes: dto.notes ?? null,
        requestId: idempotencyKey ?? randomUUID(),
      },
    );

    const teamNotified = results.some(Boolean);
    return {
      requested: teamNotified,
      teamNotified,
      message: teamNotified
        ? 'Se avisó al equipo: se comunicará con la clienta para coordinar la compra.'
        : 'No hay nadie del equipo a quien avisar en este momento; no prometas que alguien escribirá.',
    };
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

    const results = await this.eventBus.publishAsync(
      EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED,
      {
        phone,
        lid: req.conduitContact?.lid ?? null,
        clientName: client?.name ?? null,
        reason: dto.reason,
        summary: dto.summary ?? null,
        requestId: idempotencyKey ?? randomUUID(),
      },
    );

    const teamNotified = results.some(Boolean);
    return {
      handedOff: teamNotified,
      teamNotified,
      message: teamNotified
        ? 'El equipo fue notificado y responderá por este mismo chat lo antes posible.'
        : 'No hay nadie del equipo a quien avisar en este momento; no prometas que una persona escribirá.',
    };
  }
}
