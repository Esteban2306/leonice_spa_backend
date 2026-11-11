import { AiModelPublic, toPublicAiModels } from './ai-model-public';

export const VERIFICATION_CAPABILITY = 'image-analysis';
export const VERIFICATION_SPECIALIST_KEY = 'comprobante-anticipo';

export type VerificationMode = 'OFF' | 'SHADOW' | 'ACTIVE';

export interface SpecialistSummary {
  id: string;
  key: string;
  name: string;
  status: string;
  version: number;
}

export interface BindingSummary {
  mode: VerificationMode;
  onFailure: string;
  timeoutMs: number;
  blockMessage: string | null;
}

export interface RecentVerification {
  id: string;
  createdAt: string | null;
  verdict: string;
  mode: string;
  reasonCodes: string[];
  amount: number | null;
  date: string | null;
  destinationLast4: string | null;
  pendingReview: boolean;
  reviewDecision: string | null;
}

export type ChecklistKey =
  'runtime' | 'images' | 'specialist' | 'model' | 'binding';

export interface ChecklistItem {
  key: ChecklistKey;
  ok: boolean | null;
}

export interface VerificationStatus {
  runtimeEnabled: boolean | null;
  imageAnalysisEnabled: boolean;
  specialist: SpecialistSummary | null;
  binding: BindingSummary | null;
  models: AiModelPublic[];
  recent: RecentVerification[];
  pendingReview: number;
  checklist: ChecklistItem[];
  ready: boolean;
  partial: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const MODES: readonly string[] = ['OFF', 'SHADOW', 'ACTIVE'];

export function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  if (isRecord(value) && Array.isArray(value.data)) return value.data;
  return [];
}

export function toSpecialistSummary(value: unknown): SpecialistSummary | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  return {
    id: value.id,
    key: text(value.key) ?? '',
    name: text(value.name) ?? '',
    status: text(value.status) ?? '',
    version: finite(value.version) ?? 0,
  };
}

export function findBinding(bindings: unknown): {
  binding: BindingSummary;
  specialist: SpecialistSummary | null;
} | null {
  const row = listOf(bindings).find(
    (item) => isRecord(item) && item.capability === VERIFICATION_CAPABILITY,
  );
  if (!isRecord(row)) return null;
  const mode = text(row.mode);
  if (!mode || !MODES.includes(mode)) return null;
  return {
    binding: {
      mode: mode as VerificationMode,
      onFailure: text(row.onFailure) ?? 'DEGRADE',
      timeoutMs: finite(row.timeoutMs) ?? 12000,
      blockMessage: text(row.blockMessage),
    },
    specialist:
      toSpecialistSummary(row.specialist) ??
      (typeof row.specialistId === 'string'
        ? {
            id: row.specialistId,
            key: '',
            name: '',
            status: '',
            version: 0,
          }
        : null),
  };
}

export function toRecentVerification(
  value: unknown,
): RecentVerification | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const fields = isRecord(value.fields) ? value.fields : {};
  const destination = text(fields.destination);
  const digits = destination?.replace(/\D/g, '') ?? '';
  const verdict = text(value.verdict) ?? '';
  const reviewedAt = text(value.reviewedAt);
  return {
    id: value.id,
    createdAt: text(value.createdAt),
    verdict,
    mode: text(value.mode) ?? '',
    reasonCodes: Array.isArray(value.reasonCodes)
      ? value.reasonCodes.filter((c): c is string => typeof c === 'string')
      : [],
    amount: finite(fields.amount),
    date: text(fields.date),
    destinationLast4: digits.length >= 4 ? digits.slice(-4) : null,
    pendingReview:
      (verdict === 'NEEDS_REVIEW' || verdict === 'ERROR') && !reviewedAt,
    reviewDecision: text(value.reviewDecision),
  };
}

const usableModel = (model: AiModelPublic) =>
  model.isActive &&
  (model.role === 'IMAGE_ANALYSIS' || model.role === 'FALLBACK') &&
  (model.unavailableUntil === null ||
    Date.parse(model.unavailableUntil) <= Date.now());

export function buildStatus(input: {
  runtimeEnabled: boolean | null;
  imageAnalysisEnabled: boolean;
  specialist: SpecialistSummary | null;
  binding: BindingSummary | null;
  rawModels: unknown;
  rawRecent: unknown;
  pendingReview: number;
  partial: boolean;
}): VerificationStatus {
  const models = toPublicAiModels(input.rawModels);
  const recent = listOf(input.rawRecent)
    .map(toRecentVerification)
    .filter((v): v is RecentVerification => v !== null);

  const checklist: ChecklistItem[] = [
    { key: 'runtime', ok: input.runtimeEnabled },
    { key: 'images', ok: input.imageAnalysisEnabled },
    {
      key: 'specialist',
      ok: input.specialist !== null && input.specialist.status === 'ACTIVE',
    },
    { key: 'model', ok: models.some(usableModel) },
    { key: 'binding', ok: input.binding?.mode === 'ACTIVE' },
  ];

  return {
    runtimeEnabled: input.runtimeEnabled,
    imageAnalysisEnabled: input.imageAnalysisEnabled,
    specialist: input.specialist,
    binding: input.binding,
    models,
    recent,
    pendingReview: input.pendingReview,
    checklist,
    ready: checklist.every((item) => item.ok === true),
    partial: input.partial,
  };
}
