const TRANSIENT_CODES = new Set([
  'EPIPE',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
]);

export const UPLOAD_ATTEMPTS = 4;
export const UPLOAD_RETRY_DELAY_MS = 400;

export function isTransientUploadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, http_code: httpCode } = error as {
    code?: unknown;
    http_code?: unknown;
  };
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  return typeof httpCode === 'number' && (httpCode === 499 || httpCode >= 500);
}

export async function withUploadRetry<T>(
  upload: () => Promise<T>,
  {
    attempts = UPLOAD_ATTEMPTS,
    delayMs = UPLOAD_RETRY_DELAY_MS,
    onRetry,
  }: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await upload();
    } catch (error) {
      if (attempt >= attempts || !isTransientUploadError(error)) throw error;
      onRetry?.(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
