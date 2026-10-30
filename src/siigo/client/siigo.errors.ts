export type SiigoErrorKind =
  | 'NOT_CONFIGURED'
  | 'AUTH'
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface SiigoErrorDetail {
  code: string;
  message: string;
  params: string[];
}

const RETRYABLE_KINDS: ReadonlySet<SiigoErrorKind> = new Set([
  'RATE_LIMIT',
  'TIMEOUT',
  'UNAVAILABLE',
]);

export class SiigoError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly kind: SiigoErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly details: SiigoErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'SiigoError';
    this.retryable = RETRYABLE_KINDS.has(kind);
  }

  get codes(): string[] {
    return this.details.map((detail) => detail.code);
  }
}

interface RawSiigoErrorBody {
  Errors?: Array<{
    Code?: string;
    Message?: string;
    Params?: string[];
  }>;
}

const DUPLICATE_CODES = new Set(['already_exists', 'duplicated_document']);
const RATE_LIMIT_CODES = new Set(['requests_limit']);
const UNAVAILABLE_CODES = new Set([
  'service_unavailable',
  'documents_service',
  'payment_types_service',
  'general_service',
  'entry_service',
]);
const AUTH_CODES = new Set(['unauthorized']);

function parseDetails(body: unknown): SiigoErrorDetail[] {
  const errors = (body as RawSiigoErrorBody | null)?.Errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((entry) => ({
    code: String(entry.Code ?? 'unknown'),
    message: String(entry.Message ?? ''),
    params: Array.isArray(entry.Params) ? entry.Params.map(String) : [],
  }));
}

function classify(status: number, codes: string[]): SiigoErrorKind {
  if (codes.some((code) => AUTH_CODES.has(code))) return 'AUTH';
  if (codes.some((code) => RATE_LIMIT_CODES.has(code))) return 'RATE_LIMIT';
  if (codes.some((code) => DUPLICATE_CODES.has(code))) return 'DUPLICATE';
  if (codes.some((code) => UNAVAILABLE_CODES.has(code))) return 'UNAVAILABLE';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status === 409) return 'DUPLICATE';
  if (status >= 500) return 'UNAVAILABLE';
  if (status >= 400) return 'VALIDATION';
  return 'UNKNOWN';
}

export function siigoErrorFromResponse(
  status: number,
  body: unknown,
): SiigoError {
  const details = parseDetails(body);
  const kind = classify(
    status,
    details.map((detail) => detail.code),
  );
  const text = details
    .map((detail) => `${detail.code}: ${detail.message}`)
    .join('; ');
  return new SiigoError(
    kind,
    text || `Siigo respondió ${status}`,
    status,
    details,
  );
}
