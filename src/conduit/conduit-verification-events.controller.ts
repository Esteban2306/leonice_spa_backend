import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { ConduitVerificationWebhookSignatureGuard } from './guards/conduit-verification-webhook-signature.guard';
import { ConduitVerificationEventDto } from './dto/conduit-verification-event.dto';
import {
  parseReceiptContact,
  ReceiptAlertsService,
} from './verification/receipt-alerts.service';

const LIMIT_PER_MINUTE = 600;
const VERIFICATION_CAPABILITY = 'image-analysis';

/**
 * Resultados de verificación de comprobantes que Conduit avisa por webhook.
 * Solo avisan al equipo (un comprobante dudoso, o varios rechazos seguidos
 * de la misma clienta): no confirman ni rechazan nada, eso lo sigue
 * decidiendo una persona desde el panel.
 */
@Controller({ path: 'integrations/conduit/verification-events', version: '1' })
export class ConduitVerificationEventsController {
  constructor(private readonly alerts: ReceiptAlertsService) {}

  @Public()
  @SkipCsrf()
  @UseGuards(ConduitVerificationWebhookSignatureGuard)
  @Throttle({ default: { limit: LIMIT_PER_MINUTE, ttl: 60_000 } })
  @HttpCode(200)
  @Post()
  async receive(
    @Body() dto: ConduitVerificationEventDto,
    @Headers('x-conduit-event-id') eventId?: string,
  ) {
    const { data } = dto;
    if (data.capability !== VERIFICATION_CAPABILITY) {
      return { received: true, ignored: true };
    }
    const contact = parseReceiptContact(data.contact);
    if (!contact) return { received: true, ignored: true };
    if (await this.alerts.alreadySeen(eventId)) {
      return { received: true, duplicate: true };
    }

    if (data.verdict === 'VALID') {
      await this.alerts.valid(contact);
    } else if (data.verdict === 'INVALID') {
      await this.alerts.invalid(
        contact,
        data.verificationId,
        data.reasonCodes ?? [],
      );
    } else if (data.verdict === 'NEEDS_REVIEW') {
      await this.alerts.review(
        contact,
        data.verificationId,
        data.reasonCodes ?? [],
      );
    }
    return { received: true };
  }
}
