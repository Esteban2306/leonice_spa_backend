import { Module } from '@nestjs/common';
import { ConduitApiClient } from './client/conduit-api.client';
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

@Module({
  imports: [ClientsModule, ReservationsModule, CatalogModule],
  controllers: [
    ConduitWebhooksController,
    ConduitToolsController,
    ConduitBookingToolsController,
  ],
  providers: [
    ConduitApiClient,
    HmacSignatureGuard,
    ConduitMessageDeliveryLogRepository,
    ConduitMessageEventsService,
    ConduitWebhookSignatureGuard,
    ConduitOutboxRepository,
    ConduitOutboxService,
    ConduitOutboxListener,
    ConduitOutboxProcessor,
  ],
  exports: [ConduitApiClient, HmacSignatureGuard],
})
export class ConduitModule {}
