import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { ConduitWebhookSignatureGuard } from './guards/conduit-webhook-signature.guard';
import { ConduitMessageEventDto } from './dto/conduit-message-event.dto';
import { ConduitMessageEventsService } from './service/conduit-message-events.service';
import { ConduitMessageDeliveryLogRepository } from './repositories/conduit-message-delivery-log.repository';
import { FindMessageEventsQueryDto } from './dto/find-message-events-query.dto';

@Controller({ path: 'integrations/conduit/message-events', version: '1' })
export class ConduitWebhooksController {
  constructor(
    private readonly service: ConduitMessageEventsService,
    private readonly repository: ConduitMessageDeliveryLogRepository,
  ) {}

  @Get()
  findAll(@Query() query: FindMessageEventsQueryDto) {
    return this.repository.findAll(query);
  }

  @Public()
  @SkipCsrf()
  @UseGuards(ConduitWebhookSignatureGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post()
  async receive(@Body() dto: ConduitMessageEventDto) {
    await this.service.handle(dto);
    return { received: true };
  }
}
