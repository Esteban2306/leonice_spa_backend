import { Module } from '@nestjs/common';
import { ConduitApiClient } from './client/conduit-api.client';
import { ConduitTemplateResolver } from './templates/conduit-template-resolver';
import { HmacSignatureGuard } from './guards/hmac-signature.guard';
import { ConduitWebhooksController } from './conduit.controller';
import { ConduitMessageDeliveryLogRepository } from './repositories/conduit-message-delivery-log.repository';
import { ConduitMessageEventsService } from './service/conduit-message-events.service';
import { ConduitWebhookSignatureGuard } from './guards/conduit-webhook-signature.guard';
import { ConduitToolsController } from './conduit-tools.controller';
import { ClientsModule } from 'src/clients/clients.module';
import { ConduitOutboxRepository } from './repositories/conduit-outbox.repository';
import { ConduitOutboxService } from './service/conduit-outbox.service';
import { ConduitOutboxListener } from './listeners/conduit-outbox.listener';
import { ConduitOutboxProcessor } from './processors/conduit-outbox.processor';
import { ConduitBookingToolsController } from './conduit-booking-tools.controller';
import { ReservationsModule } from '../reservations/reservations.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ConduitSupportToolsController } from './conduit-support-tools.controller';
import { ConduitAdminController } from './admin/conduit-admin.controller';
import { BusinessSettingsModule } from '../business-settings/business-settings.module';

@Module({
  imports: [
    ClientsModule,
    ReservationsModule,
    CatalogModule,
    BusinessSettingsModule,
  ],
  controllers: [
    ConduitWebhooksController,
    ConduitToolsController,
    ConduitBookingToolsController,
    ConduitSupportToolsController,
    ConduitAdminController,
  ],
  providers: [
    ConduitApiClient,
    ConduitTemplateResolver,
    HmacSignatureGuard,
    ConduitMessageDeliveryLogRepository,
    ConduitMessageEventsService,
    ConduitWebhookSignatureGuard,
    ConduitOutboxRepository,
    ConduitOutboxService,
    ConduitOutboxListener,
    ConduitOutboxProcessor,
  ],
  exports: [ConduitApiClient, ConduitTemplateResolver, HmacSignatureGuard],
})
export class ConduitModule {}
