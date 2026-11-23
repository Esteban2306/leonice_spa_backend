import { ProductOrdersModule } from '../product-orders/product-orders.module';
import { ConduitProductOrdersController } from './conduit-product-orders.controller';
import { Module } from '@nestjs/common';
import { ConduitApiClient } from './client/conduit-api.client';
import { ConduitTemplateResolver } from './templates/conduit-template-resolver';
import { HmacSignatureGuard } from './guards/hmac-signature.guard';
import { ConduitWebhooksController } from './conduit.controller';
import { ConduitMessageDeliveryLogRepository } from './repositories/conduit-message-delivery-log.repository';
import { ConduitMessageEventsService } from './service/conduit-message-events.service';
import { ConduitWebhookSignatureGuard } from './guards/conduit-webhook-signature.guard';
import { ConduitVerificationWebhookSignatureGuard } from './guards/conduit-verification-webhook-signature.guard';
import { ConduitToolsController } from './conduit-tools.controller';
import { ClientsModule } from 'src/clients/clients.module';
import { ConduitOutboxRepository } from './repositories/conduit-outbox.repository';
import { ConduitOutboxService } from './service/conduit-outbox.service';
import { ConduitOutboxListener } from './listeners/conduit-outbox.listener';
import { ConduitOutboxProcessor } from './processors/conduit-outbox.processor';
import { ConduitOutboxSweepScheduler } from './service/conduit-outbox-sweep.scheduler';
import { ConduitBookingToolsController } from './conduit-booking-tools.controller';
import { ReservationsModule } from '../reservations/reservations.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ConduitSupportToolsController } from './conduit-support-tools.controller';
import { ConduitTeamQuotesController } from './conduit-team-quotes.controller';
import { TeamQuoteService } from './quotes/team-quote.service';
import { ConduitAdminController } from './admin/conduit-admin.controller';
import { ConduitSpecialistController } from './admin/conduit-specialist.controller';
import { ConduitVerificationEventsController } from './conduit-verification-events.controller';
import { ReceiptAlertsService } from './verification/receipt-alerts.service';
import { TeamHandoffService } from './handoff/team-handoff.service';
import { BusinessSettingsModule } from '../business-settings/business-settings.module';
import { ProductsModule } from '../products/products.module';
import { ConduitSystemPauseService } from './pause/conduit-system-pause.service';
import { PromotionsModule } from '../promotions/promotions.module';
import { ConduitPromotionOffersService } from './promotions/conduit-promotion-offers.service';

@Module({
  imports: [
    ClientsModule,
    ReservationsModule,
    CatalogModule,
    BusinessSettingsModule,
    ProductsModule,
    PromotionsModule,
    ProductOrdersModule,
  ],
  controllers: [
    ConduitWebhooksController,
    ConduitToolsController,
    ConduitBookingToolsController,
    ConduitSupportToolsController,
    ConduitTeamQuotesController,
    ConduitAdminController,
    ConduitSpecialistController,
    ConduitVerificationEventsController,
    ConduitProductOrdersController,
  ],
  providers: [
    TeamQuoteService,
    ConduitApiClient,
    ConduitSystemPauseService,
    ConduitTemplateResolver,
    HmacSignatureGuard,
    ConduitMessageDeliveryLogRepository,
    ConduitMessageEventsService,
    ConduitWebhookSignatureGuard,
    ConduitVerificationWebhookSignatureGuard,
    ConduitOutboxRepository,
    ConduitOutboxService,
    ConduitOutboxListener,
    ConduitOutboxProcessor,
    ConduitOutboxSweepScheduler,
    ReceiptAlertsService,
    TeamHandoffService,
    ConduitPromotionOffersService,
  ],
  exports: [
    ConduitApiClient,
    ConduitSystemPauseService,
    ConduitTemplateResolver,
    HmacSignatureGuard,
  ],
})
export class ConduitModule {}
