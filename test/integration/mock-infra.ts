jest.mock('ioredis', () => {
  const store = new Map<string, string>();
  class FakeRedis {
    status = 'ready';
    on() {
      return this;
    }
    once() {
      return this;
    }
    get(key: string) {
      return Promise.resolve(store.get(key) ?? null);
    }
    set(key: string, value: string, ...args: unknown[]) {
      if (args.includes('NX') && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    }
    del(key: string) {
      store.delete(key);
      return Promise.resolve(1);
    }
    ping() {
      return Promise.resolve('PONG');
    }
    quit() {
      return Promise.resolve('OK');
    }
    disconnect() {
      return undefined;
    }
  }
  return { __esModule: true, default: FakeRedis, Redis: FakeRedis };
});

jest.mock('@nest-lab/throttler-storage-redis', () => {
  const actual =
    jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
  class ThrottlerStorageRedisService extends actual.ThrottlerStorageService {}
  return { ThrottlerStorageRedisService };
});

export {};
