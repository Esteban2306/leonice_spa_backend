import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';

/**
 * Clave de idempotencia para los envíos a Conduit. El id de un job de
 * BullMQ no cambia entre reintentos, así que todos los intentos del mismo
 * job comparten clave y Conduit nunca envía dos veces el mismo WhatsApp.
 * Se resume con un hash para respetar el límite de 128 caracteres.
 */
export function conduitIdempotencyKey(job: Pick<Job, 'queueName' | 'id'>) {
  const digest = createHash('sha256')
    .update(`${job.queueName}:${job.id}`)
    .digest('hex')
    .slice(0, 48);
  return `leonice-${digest}`;
}
