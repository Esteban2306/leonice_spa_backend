export type AuditEntityType =
  'Client' | 'Reservation' | 'Treatment' | 'CapacityPool';

export type AuditAction =
  | 'CREATE_CLIENT'
  | 'UPDATE_CLIENT'
  | 'RECORD_CLIENT_CONSENT'
  | 'CREATE_RESERVATION'
  | 'UPDATE_RESERVATION'
  | 'CREATE_TREATMENT'
  | 'UPDATE_TREATMENT'
  | 'DELETE_TREATMENT'
  | 'UPDATE_CAPACITY_POOL';

export type EntityIdSource = 'param' | 'result' | 'result-reservations';

export interface AuditRule {
  method: string;
  pattern: RegExp;
  action: AuditAction;
  entityType: AuditEntityType;
  idSource: EntityIdSource;
}

export const AUDIT_RULES: readonly AuditRule[] = [
  {
    method: 'POST',
    pattern: /^\/clients\/?$/,
    action: 'CREATE_CLIENT',
    entityType: 'Client',
    idSource: 'result',
  },
  {
    method: 'PATCH',
    pattern: /^\/clients\/([^/]+)\/?$/,
    action: 'UPDATE_CLIENT',
    entityType: 'Client',
    idSource: 'param',
  },
  {
    method: 'PUT',
    pattern: /^\/clients\/([^/]+)\/hair-profile\/?$/,
    action: 'UPDATE_CLIENT',
    entityType: 'Client',
    idSource: 'param',
  },
  {
    method: 'POST',
    pattern: /^\/clients\/([^/]+)\/hair-profile\/confirm\/?$/,
    action: 'UPDATE_CLIENT',
    entityType: 'Client',
    idSource: 'param',
  },
  {
    method: 'POST',
    pattern: /^\/clients\/([^/]+)\/consents\/?$/,
    action: 'RECORD_CLIENT_CONSENT',
    entityType: 'Client',
    idSource: 'param',
  },
  {
    method: 'POST',
    pattern: /^\/reservations\/?$/,
    action: 'CREATE_RESERVATION',
    entityType: 'Reservation',
    idSource: 'result-reservations',
  },
  {
    method: 'PATCH',
    pattern: /^\/reservations\/([^/]+)\/[a-z-]+\/?$/,
    action: 'UPDATE_RESERVATION',
    entityType: 'Reservation',
    idSource: 'param',
  },
  {
    method: 'POST',
    pattern: /^\/treatments\/?$/,
    action: 'CREATE_TREATMENT',
    entityType: 'Treatment',
    idSource: 'result',
  },
  {
    method: 'PATCH',
    pattern: /^\/treatments\/([^/]+)\/?$/,
    action: 'UPDATE_TREATMENT',
    entityType: 'Treatment',
    idSource: 'param',
  },
  {
    method: 'DELETE',
    pattern: /^\/treatments\/([^/]+)\/?$/,
    action: 'DELETE_TREATMENT',
    entityType: 'Treatment',
    idSource: 'param',
  },
  {
    method: 'PATCH',
    pattern: /^\/capacity-pools\/([^/]+)\/?$/,
    action: 'UPDATE_CAPACITY_POOL',
    entityType: 'CapacityPool',
    idSource: 'param',
  },
];

const API_PREFIX = /^\/api(?:\/v\d+)?(?=\/|$)/;

export function normalizeAuditPath(path: string): string {
  return path.replace(API_PREFIX, '') || '/';
}

export interface MatchedAuditRule {
  rule: AuditRule;
  paramId: string | null;
}

export function matchAuditRule(
  method: string,
  path: string,
): MatchedAuditRule | null {
  const normalized = normalizeAuditPath(path);
  for (const rule of AUDIT_RULES) {
    if (rule.method !== method.toUpperCase()) continue;
    const match = rule.pattern.exec(normalized);
    if (match) return { rule, paramId: match[1] ?? null };
  }
  return null;
}

const REDACTED_KEYS = new Set([
  'allergies',
  'passwordHash',
  'refreshTokenHash',
  'previousRefreshTokenHash',
]);

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key)
        ? inner === null || inner === undefined
          ? inner
          : '[REDACTADO]'
        : redactAuditValue(inner);
    }
    return out;
  }
  return value;
}

export function extractResultIds(
  source: EntityIdSource,
  result: unknown,
): string[] {
  if (!result || typeof result !== 'object') return [];
  if (source === 'result') {
    const id = (result as { id?: unknown }).id;
    return typeof id === 'string' ? [id] : [];
  }
  if (source === 'result-reservations') {
    const reservations = (result as { reservations?: unknown }).reservations;
    if (!Array.isArray(reservations)) return [];
    return reservations
      .map((r) => (r as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string');
  }
  return [];
}
