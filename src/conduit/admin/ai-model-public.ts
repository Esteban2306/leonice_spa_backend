export interface AiModelPublic {
  id: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  role: string;
  tier: string;
  priority: number;
  isActive: boolean;
  dailyTokenLimit: number | null;
  minuteRequestLimit: number | null;
  tokensUsedToday: number;
  requestsThisMinute: number | null;
  unavailableUntil: string | null;
  apiKeyLast4: string | null;
  createdAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const count = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

export function toPublicAiModel(model: unknown): AiModelPublic | null {
  if (!isRecord(model) || typeof model.id !== 'string') return null;
  return {
    id: model.id,
    provider: text(model.provider) ?? '',
    model: text(model.model) ?? '',
    baseUrl: text(model.baseUrl),
    role: text(model.role) ?? '',
    tier: text(model.tier) ?? '',
    priority: count(model.priority) ?? 0,
    isActive: model.isActive === true,
    dailyTokenLimit: count(model.dailyTokenLimit),
    minuteRequestLimit: count(model.minuteRequestLimit),
    tokensUsedToday: count(model.tokensUsedToday) ?? 0,
    requestsThisMinute: count(model.requestsThisMinute),
    unavailableUntil: text(model.unavailableUntil),
    apiKeyLast4: text(model.apiKeyLast4),
    createdAt: text(model.createdAt),
  };
}

export function toPublicAiModels(models: unknown): AiModelPublic[] {
  const list = Array.isArray(models)
    ? models
    : isRecord(models) && Array.isArray(models.data)
      ? models.data
      : [];
  return list
    .map(toPublicAiModel)
    .filter((model): model is AiModelPublic => model !== null);
}
