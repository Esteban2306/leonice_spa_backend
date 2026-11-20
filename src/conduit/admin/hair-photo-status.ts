import { AiModelPublic, toPublicAiModels } from './ai-model-public';
import {
  SpecialistSummary,
  VerificationMode,
  listOf,
} from './conduit-specialist-status';
import { HAIR_CAPABILITY } from '../specialists/hair-photo-specialist';

export interface RecentHairPhoto {
  id: string;
  createdAt: string | null;
  verdict: string;
  mode: string;
  description: string | null;
}

export interface HairPhotoStatus {
  imageAnalysisEnabled: boolean;
  specialist: SpecialistSummary | null;
  mode: VerificationMode | null;
  models: AiModelPublic[];
  modelReady: boolean;
  recent: RecentHairPhoto[];
  partial: boolean;
}

const MODES: readonly string[] = ['OFF', 'SHADOW', 'ACTIVE'];
const MAX_DESCRIPTION = 400;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

function bindingMode(bindings: unknown): VerificationMode | null {
  const row = listOf(bindings).find(
    (item) => isRecord(item) && item.capability === HAIR_CAPABILITY,
  );
  const mode = isRecord(row) ? text(row.mode) : null;
  return mode && MODES.includes(mode) ? (mode as VerificationMode) : null;
}

function toRecentHairPhoto(value: unknown): RecentHairPhoto | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const fields = isRecord(value.fields) ? value.fields : {};
  const description =
    [text(fields.descripcion), text(fields.senales)]
      .filter(Boolean)
      .join(' · ') || null;
  return {
    id: value.id,
    createdAt: text(value.createdAt),
    verdict: text(value.verdict) ?? '',
    mode: text(value.mode) ?? '',
    description: description ? description.slice(0, MAX_DESCRIPTION) : null,
  };
}

const usable = (model: AiModelPublic) =>
  model.isActive &&
  (model.role === 'IMAGE_ANALYSIS' || model.role === 'FALLBACK') &&
  (model.unavailableUntil === null ||
    Date.parse(model.unavailableUntil) <= Date.now());

export function buildHairPhotoStatus(input: {
  imageAnalysisEnabled: boolean;
  specialist: SpecialistSummary | null;
  bindings: unknown;
  rawModels: unknown;
  rawRecent: unknown;
  partial: boolean;
}): HairPhotoStatus {
  const models = toPublicAiModels(input.rawModels);
  return {
    imageAnalysisEnabled: input.imageAnalysisEnabled,
    specialist: input.specialist,
    mode: input.specialist ? bindingMode(input.bindings) : null,
    models,
    modelReady: models.some(usable),
    recent: listOf(input.rawRecent)
      .map(toRecentHairPhoto)
      .filter((photo): photo is RecentHairPhoto => photo !== null),
    partial: input.partial,
  };
}
