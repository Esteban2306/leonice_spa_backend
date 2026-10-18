export const ENQUEUE_WAIT_MS = 2_000;

export type EnqueueOutcome = 'QUEUED' | 'DEFERRED';

export async function enqueueWithin(
  enqueue: Promise<unknown>,
  onLateFailure: (error: unknown) => void,
  waitMs = ENQUEUE_WAIT_MS,
): Promise<EnqueueOutcome> {
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const queued = enqueue.then(() => 'QUEUED' as const);
  queued.catch((error: unknown) => {
    if (timedOut) onLateFailure(error);
  });
  const deferred = new Promise<EnqueueOutcome>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve('DEFERRED');
    }, waitMs);
  });
  try {
    return await Promise.race([queued, deferred]);
  } finally {
    clearTimeout(timer);
  }
}
