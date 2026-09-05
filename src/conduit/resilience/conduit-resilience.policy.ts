import { Logger } from '@nestjs/common';
import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  circuitBreaker,
  handleAll,
  retry,
  timeout,
  wrap,
} from 'cockatiel';

const logger = new Logger('ConduitCircuitBreaker');

const conduitBreaker = circuitBreaker(handleAll, {
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

const conduitTimeout = timeout(3_000, TimeoutStrategy.Aggressive);

export const conduitSendPolicy = wrap(conduitBreaker, conduitTimeout);

export const conduitQueryPolicy = wrap(
  conduitBreaker,
  retry(handleAll, { maxAttempts: 2, backoff: new ExponentialBackoff() }),
  conduitTimeout,
);

export const conduitEventPushPolicy = wrap(
  conduitBreaker,
  retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() }),
  conduitTimeout,
);
