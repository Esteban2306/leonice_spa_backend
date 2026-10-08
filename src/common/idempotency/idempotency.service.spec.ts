import type { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import {
  decideIdempotency,
  fingerprintRequest,
  idempotencyStoreKey,
} from './idempotency-decision';
import { IdempotencyService } from './idempotency.service';

jest.mock('../../infrastructure/redis/safe-cache.service', () => ({
  SafeCacheService: class {},
}));

class FakeCache {
  readonly store = new Map<string, unknown>();
  down = false;

  get<T>(key: string): Promise<T | null> {
    if (this.down) return Promise.resolve(null);
    return Promise.resolve((this.store.get(key) as T) ?? null);
  }

  set(key: string, value: unknown): Promise<void> {
    if (!this.down) this.store.set(key, value);
    return Promise.resolve();
  }

  setIfAbsent(key: string, value: unknown): Promise<boolean | null> {
    if (this.down) return Promise.resolve(null);
    if (this.store.has(key)) return Promise.resolve(false);
    this.store.set(key, value);
    return Promise.resolve(true);
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

const build = () => {
  const cache = new FakeCache();
  const service = new IdempotencyService(cache as unknown as SafeCacheService);
  return { cache, service };
};

const FP = fingerprintRequest({
  params: { id: 'r1' },
  query: {},
  body: { a: 1 },
});

describe('fingerprintRequest', () => {
  it('no depende del orden de las claves ni de campos undefined', () => {
    expect(
      fingerprintRequest({
        params: {},
        query: {},
        body: { b: 2, a: { y: 1, x: [1, 2] }, c: undefined },
      }),
    ).toBe(
      fingerprintRequest({
        params: {},
        query: {},
        body: { a: { x: [1, 2], y: 1 }, b: 2 },
      }),
    );
  });

  it('cambia si cambia el cuerpo', () => {
    expect(
      fingerprintRequest({ params: {}, query: {}, body: { a: 1 } }),
    ).not.toBe(fingerprintRequest({ params: {}, query: {}, body: { a: 2 } }));
  });
});

describe('idempotencyStoreKey', () => {
  it('la misma clave en otra ruta o de otro actor es otro registro', () => {
    const base = {
      method: 'POST',
      route: '/r',
      actor: 'u1',
      key: 'k-12345678',
    };
    const key = idempotencyStoreKey(base);
    expect(idempotencyStoreKey({ ...base, route: '/otra' })).not.toBe(key);
    expect(idempotencyStoreKey({ ...base, actor: 'u2' })).not.toBe(key);
  });
});

describe('decideIdempotency', () => {
  it('sin registro ejecuta', () => {
    expect(decideIdempotency(null, FP)).toEqual({ kind: 'EXECUTE' });
  });

  it('otra huella con la misma clave se rechaza', () => {
    expect(
      decideIdempotency({ state: 'IN_PROGRESS', fingerprint: 'otra' }, FP),
    ).toEqual({ kind: 'REJECT', code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});

describe('IdempotencyService', () => {
  it('ejecuta una vez y luego repite la misma respuesta', async () => {
    const { service } = build();
    expect(await service.begin('k', FP)).toEqual({ kind: 'EXECUTE' });
    await service.complete('k', FP, 201, { id: 'r1' });

    expect(await service.begin('k', FP)).toEqual({
      kind: 'REPLAY',
      statusCode: 201,
      body: { id: 'r1' },
    });
  });

  it('un duplicado mientras la primera sigue en curso recibe IN_PROGRESS', async () => {
    const { service } = build();
    await service.begin('k', FP);
    expect(await service.begin('k', FP)).toEqual({
      kind: 'REJECT',
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
  });

  it('si la operación falla, la clave se libera para reintentar', async () => {
    const { service } = build();
    await service.begin('k', FP);
    await service.abandon('k');
    expect(await service.begin('k', FP)).toEqual({ kind: 'EXECUTE' });
  });

  it('reusar la clave con otro cuerpo se rechaza', async () => {
    const { service } = build();
    await service.begin('k', FP);
    await service.complete('k', FP, 200, {});
    const other = fingerprintRequest({ params: {}, query: {}, body: { a: 9 } });
    expect(await service.begin('k', other)).toEqual({
      kind: 'REJECT',
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('con Redis caído no bloquea la operación (fail-open)', async () => {
    const { service, cache } = build();
    cache.down = true;
    expect(await service.begin('k', FP)).toEqual({ kind: 'EXECUTE' });
  });
});
