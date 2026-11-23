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
import {
  detectConcerns,
  matchProducts,
  matchTreatments,
  NEED_UNCLEAR_HINT,
  NO_MATCH_HINT,
} from './tools/bot-recommendation';
import { toBotTreatmentListItem } from './tools/bot-treatment-view';
import { TreatmentsService } from '../catalog/treatments/treatments.service';
import { TeamHandoffService } from './handoff/team-handoff.service';
import { PromotionsService } from '../promotions/promotions.service';
import { ConduitPromotionOffersService } from './promotions/conduit-promotion-offers.service';
import {
  MAX_PROMOTION_OFFERS,
  NO_PROMOTIONS_HINT,
  PROMOTIONS_HINT,
} from './promotions/bot-promotion-offers';

@Controller({ path: 'conduit', version: '1' })
@ConduitTool()
export class ConduitSupportToolsController {
  constructor(
    private readonly businessSettings: BusinessSettingsService,
    private readonly clients: ClientsRepository,
    private readonly eventBus: EventBusService,
    private readonly productCatalog: ProductCatalogService,
    private readonly treatments: TreatmentsService,
    private readonly handoffs: TeamHandoffService,
    private readonly promotions: PromotionsService,
    private readonly promotionOffers: ConduitPromotionOffersService,
  ) {}

  @ConduitToolOptionsMeta({ publicData: true })
  @Get('recommendations')
  async recommendations(
    @Req() req: RequestWithConduitContact,
    @Query('need') need?: string,
  ) {
    const text = (need ?? '').slice(0, 200);
    const concerns = detectConcerns(text);
    if (concerns.length === 0) {
      return { status: 'need_unclear', hint: NEED_UNCLEAR_HINT };
    }
    const phone = req.conduitContact?.phone;
    const [treatments, catalog, client, promotions] = await Promise.all([
      this.treatments.findAll(),
      this.productCatalog.listRecords(),
      phone ? this.clients.findByPhone(phone) : null,
      this.promotions.findAllCurrentlyValid(),
    ]);
    const needs = concerns.map((concern) => ({
      need: concern.label,
      services: matchTreatments(treatments, [concern])
        .slice(0, 2)
        .map(({ item, why }) => ({
          ...toBotTreatmentListItem(item, client),
          why,
        })),
      products: matchProducts(catalog, [concern], promotions).slice(0, 3),
    }));
    if (
      needs.every((n) => n.services.length === 0 && n.products.length === 0)
    ) {
      return {
        status: 'no_match',
        understood: concerns.map((c) => c.label),
        hint: NO_MATCH_HINT,
      };
    }
    return {
      status: 'found',
      needs,
      hint: 'Responde cada necesidad: recomienda el primer servicio como principal y, si una necesidad no tiene servicio, recomienda sus productos o kits con su porqué y precio. No digas que algo no existe si trae productos.',
    };
  }

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
    const [catalog, promotions] = await Promise.all([
      this.productCatalog.listRecords(),
      this.promotions.findAllCurrentlyValid(),
    ]);
    return toBotProducts(catalog, query?.slice(0, 80), promotions);
  }

  @ConduitToolOptionsMeta({ publicData: true })
  @Get('promotions')
  async currentPromotions(@Req() req: RequestWithConduitContact) {
    const phone = req.conduitContact?.phone;
    const client = phone ? await this.clients.findByPhone(phone) : null;
    const offers = await this.promotionOffers.current(client);
    if (offers.length === 0) {
      return { status: 'none' as const, hint: NO_PROMOTIONS_HINT };
    }
    return {
      status: 'found' as const,
      total: offers.length,
      offers: offers
        .slice(0, MAX_PROMOTION_OFFERS)
        .map(({ recommendedForTreatments: _, ...offer }) => offer),
      hint: PROMOTIONS_HINT,
    };
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
    const closingOffer = teamNotified
      ? await this.promotionOffers.afterPurchase(dto.request)
      : null;
    return {
      requested: teamNotified,
      teamNotified,
      message: teamNotified
        ? 'Se avisó al equipo: se comunicará con la clienta para coordinar la compra.'
        : 'No hay nadie del equipo a quien avisar en este momento; no prometas que alguien escribirá.',
      ...(closingOffer && { closingOffer }),
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
    const teamNotified = await this.requestHandoff(
      dto,
      req,
      'TEAM',
      idempotencyKey,
    );
    return {
      handedOff: teamNotified,
      teamNotified,
      message: teamNotified
        ? 'El equipo fue notificado y responderá por este mismo chat lo antes posible.'
        : 'No hay nadie del equipo a quien avisar en este momento; no prometas que una persona escribirá.',
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('handoff/owner')
  async ownerHandoff(
    @Body() dto: ConduitHandoffDto,
    @Req() req: RequestWithConduitContact,
    @Headers('x-conduit-idempotency-key') idempotencyKey?: string,
  ) {
    const teamNotified = await this.requestHandoff(
      dto,
      req,
      'OWNER',
      idempotencyKey,
    );
    return {
      handedOff: teamNotified,
      teamNotified,
      message: teamNotified
        ? 'Se le avisó a Leo que la clienta necesita hablar con ella; ella verá el mensaje y decidirá cómo responder. No des su número ni prometas cuándo escribirá.'
        : 'No fue posible avisarle a Leo en este momento; no prometas que ella escribirá ni des su número.',
    };
  }

  private async requestHandoff(
    dto: ConduitHandoffDto,
    req: RequestWithConduitContact,
    target: 'TEAM' | 'OWNER',
    idempotencyKey?: string,
  ): Promise<boolean> {
    return this.handoffs.request({
      phone:
        req.conduitContact?.phone ??
        (dto.phone ? normalizePhone(dto.phone) : null),
      lid: req.conduitContact?.lid ?? null,
      reason: dto.reason,
      summary: dto.summary ?? null,
      requestId: idempotencyKey,
      target,
    });
  }
}
