import { RetryableInfrastructureException } from '../../common/exceptions/retryable-infrastructure.exception';
import type { SendResult } from '../../conduit/client/conduit-api.client';

export function assertMessageDelivered(result: SendResult): void {
  if (!result.delivered) {
    throw new RetryableInfrastructureException(
      'Conduit no confirmó la entrega del mensaje',
    );
  }
}
