import { Injectable } from '@nestjs/common';
import { ConduitWebhookSignatureGuard } from './conduit-webhook-signature.guard';

/**
 * Firma de los avisos de verificación de comprobantes. Es un webhook
 * distinto del de estados de entrega, así que Conduit le genera otro
 * secreto: va en CONDUIT_VERIFICATION_WEBHOOK_SECRET.
 */
@Injectable()
export class ConduitVerificationWebhookSignatureGuard extends ConduitWebhookSignatureGuard {
  protected override readonly secretKey = 'CONDUIT_VERIFICATION_WEBHOOK_SECRET';
}
