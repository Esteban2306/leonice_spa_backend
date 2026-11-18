import { Module } from '@nestjs/common';
import { PromoEventsController } from './promo-events.controller';
import { PromoEventsService } from './promo-events.service';
import { PromoEventTicketsService } from './promo-event-tickets.service';
import { PromoEventTicketsListener } from './promo-event-tickets.listener';

@Module({
  controllers: [PromoEventsController],
  providers: [
    PromoEventsService,
    PromoEventTicketsService,
    PromoEventTicketsListener,
  ],
  exports: [PromoEventTicketsService],
})
export class PromoEventsModule {}
