import type { ThrottlerStorage } from '@nestjs/throttler';
import { ResilientThrottlerStorage } from './resilient-throttler-storage';

const record = (totalHits: number) => ({
  totalHits,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0,
});

describe('ResilientThrottlerStorage', () => {
  let storage: ResilientThrottlerStorage;

  afterEach(() => {
    storage?.onApplicationShutdown();
  });

  it('usa el almacén compartido mientras responde', async () => {
    const primary: ThrottlerStorage = {
      increment: jest.fn().mockResolvedValue(record(7)),
    };
    storage = new ResilientThrottlerStorage(primary);
    await expect(
      storage.increment('k', 60_000, 10, 0, 'default'),
    ).resolves.toEqual(record(7));
  });

  it('si el almacén compartido falla sigue contando en memoria y bloquea al superar el límite', async () => {
    const primary: ThrottlerStorage = {
      increment: jest.fn().mockRejectedValue(new Error('Redis caído')),
    };
    storage = new ResilientThrottlerStorage(primary);
    const hits: number[] = [];
    let blocked = false;
    for (let i = 0; i < 4; i++) {
      const r = await storage.increment('k', 60_000, 3, 60_000, 'default');
      hits.push(r.totalHits);
      blocked = r.isBlocked;
    }
    expect(hits).toEqual([1, 2, 3, 4]);
    expect(blocked).toBe(true);
  });

  it('si el almacén compartido no responde a tiempo no retiene la petición', async () => {
    const primary: ThrottlerStorage = {
      increment: () => new Promise(() => undefined),
    };
    storage = new ResilientThrottlerStorage(primary);
    const started = Date.now();
    const r = await storage.increment('k', 60_000, 10, 0, 'default');
    expect(r.totalHits).toBe(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('tras fallos consecutivos abre el circuito y deja de esperar al almacén caído', async () => {
    const increment = jest.fn().mockRejectedValue(new Error('Redis caído'));
    storage = new ResilientThrottlerStorage({ increment });
    for (let i = 0; i < 10; i++) {
      await storage.increment('k', 60_000, 100, 0, 'default');
    }
    expect(increment.mock.calls.length).toBeLessThan(10);
  });
});
