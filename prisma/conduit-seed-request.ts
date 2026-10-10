type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';

const MAX_ATTEMPTS = 6;
const DEFAULT_WAIT_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function conduitSeedRequest(baseUrl: string, apiKey: string) {
  return async function request<T>(
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(new URL(`/api/v1/${path}`, baseUrl), {
        method,
        headers: {
          'X-API-Key': apiKey,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : DEFAULT_WAIT_MS * attempt,
        );
        continue;
      }
      if (!res.ok) {
        throw new Error(`${method} ${path} → HTTP ${res.status}: ${text}`);
      }
      return (text ? JSON.parse(text) : null) as T;
    }
  };
}
