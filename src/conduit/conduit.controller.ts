import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { ConduitWebhookSignatureGuard } from './guards/conduit-webhook-signature.guard';
import { ConduitMessageEventDto } from './dto/conduit-message-event.dto';
import {
  CONDUIT_OPS_ALERT_EVENT,
  ConduitOpsAlertEventDto,
} from './dto/conduit-ops-alert-event.dto';
import { ConduitMessageEventsService } from './service/conduit-message-events.service';
import { ConduitMessageDeliveryLogRepository } from './repositories/conduit-message-delivery-log.repository';
import { FindMessageEventsQueryDto } from './dto/find-message-events-query.dto';

const CONDUIT_WEBHOOK_LIMIT_PER_MINUTE = 600;
const MESSAGE_EVENT_PREFIX = 'message.';
const strict = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

function eventOf(body: unknown): string {
  const event =
    typeof body === 'object' && body !== null
      ? (body as { event?: unknown }).event
      : undefined;
  if (typeof event !== 'string' || event.trim() === '') {
    throw new BadRequestException('event must be a string');
  }
  return event;
}

function validated<T>(metatype: new () => T, body: unknown): Promise<T> {
  return strict.transform(body, { type: 'body', metatype }) as Promise<T>;
}

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
  @Throttle({
    default: { limit: CONDUIT_WEBHOOK_LIMIT_PER_MINUTE, ttl: 60_000 },
  })
  @HttpCode(200)
  @Post()
  async receive(@Body() body: unknown) {
    const event = eventOf(body);
    if (event === CONDUIT_OPS_ALERT_EVENT) {
      this.service.opsAlert(await validated(ConduitOpsAlertEventDto, body));
      return { received: true };
    }
    if (!event.startsWith(MESSAGE_EVENT_PREFIX)) {
      return { received: true, ignored: true };
    }
    await this.service.handle(await validated(ConduitMessageEventDto, body));
    return { received: true };
  }
}
