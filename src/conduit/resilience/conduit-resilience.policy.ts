import { Logger } from '@nestjs/common';
import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  circuitBreaker,
  handleWhen,
  retry,
  timeout,
  wrap,
} from 'cockatiel';

const logger = new Logger('ConduitCircuitBreaker');

/**
 * Conduit rechazó la petición por su contenido (4xx): número inválido,
 * plantilla inexistente, firma incorrecta. Reintentar no lo arregla y no
 * indica que Conduit esté caído, así que no cuenta para el circuito.
 */
export class ConduitPermanentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ConduitPermanentError';
  }
}

const transientOnly = handleWhen(
  (error) => !(error instanceof ConduitPermanentError),
);

const conduitBreaker = circuitBreaker(transientOnly, {
  halfOpenAfter: 10_000,
  breaker: new ConsecutiveBreaker(5),
});

conduitBreaker.onBreak(() => {
  logger.error(
    'Circuito hacia Conduit ABIERTO — se detienen las llamadas salientes por 10s',
  );
});
conduitBreaker.onHalfOpen(() => {
  logger.warn(
    'Circuito hacia Conduit en prueba (half-open) — evaluando si ya se recuperó',
  );
});
conduitBreaker.onReset(() => {
  logger.log(
    'Circuito hacia Conduit CERRADO de nuevo — Conduit volvió a responder',
  );
});

// Los envíos son idempotentes (Idempotency-Key), así que un timeout que
// dispare un reintento ya no puede duplicar el WhatsApp; se da margen a
// Conduit para responder bajo carga.
const conduitTimeout = timeout(8_000, TimeoutStrategy.Aggressive);

export const conduitSendPolicy = wrap(conduitBreaker, conduitTimeout);

export const conduitQueryPolicy = wrap(
  conduitBreaker,
  retry(transientOnly, { maxAttempts: 2, backoff: new ExponentialBackoff() }),
  conduitTimeout,
);

export const conduitEventPushPolicy = wrap(
  conduitBreaker,
  retry(transientOnly, { maxAttempts: 3, backoff: new ExponentialBackoff() }),
  conduitTimeout,
);
