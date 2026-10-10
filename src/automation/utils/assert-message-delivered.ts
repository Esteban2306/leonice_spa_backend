import { UnrecoverableError } from 'bullmq';
import { RetryableInfrastructureException } from '../../common/exceptions/retryable-infrastructure.exception';
import type { SendResult } from '../../conduit/client/conduit-api.client';

export function assertMessageDelivered(result: SendResult): void {
  if (result.delivered) return;

  if (result.permanent) {
    // Conduit rechazó el contenido (número inválido, plantilla inexistente):
    // BullMQ no debe reintentar.
    throw new UnrecoverableError(
      `Conduit rechazó el mensaje: ${result.reason ?? 'sin detalle'}`,
    );
  }
  throw new RetryableInfrastructureException(
    `Conduit no confirmó la recepción del mensaje${result.reason ? `: ${result.reason}` : ''}`,
  );
}
