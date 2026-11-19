export function memoryCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    setIfAbsent: (key: string, value: unknown) => {
      if (store.has(key)) return Promise.resolve(false);
      store.set(key, value);
      return Promise.resolve(true);
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  };
}
