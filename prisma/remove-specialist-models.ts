import { conduitSeedRequest } from './conduit-seed-request';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ConduitRequest = <T>(
  method: Method,
  path: string,
  body?: unknown,
) => Promise<T>;

interface SpecialistRow {
  id: string;
  key?: string;
  name?: string;
  archivedAt?: string | null;
}

interface ModelRow {
  id: string;
  provider?: string;
  model?: string;
  role?: string;
  priority?: number;
  apiKeyLast4?: string | null;
  credentialInvalidAt?: string | null;
}

interface BindingRow {
  capability: string;
  specialistId: string;
  mode: 'OFF' | 'SHADOW' | 'ACTIVE';
  timeoutMs?: number;
  onFailure?: string;
  blockMessage?: string | null;
}

export interface SpecialistModelsPlan {
  models: Array<{ specialist: SpecialistRow; model: ModelRow }>;
  bindingsToTurnOff: BindingRow[];
}

const rows = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  const data = (value as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
};

const describeModel = (specialist: SpecialistRow, model: ModelRow) =>
  [
    `${specialist.name ?? specialist.key ?? specialist.id}${specialist.archivedAt ? ' (archivado)' : ''}:`,
    `${model.model ?? '?'} · ${model.provider ?? '?'}`,
    model.role ? `· ${model.role}` : '',
    model.priority !== undefined ? `· prioridad ${model.priority}` : '',
    model.apiKeyLast4 ? `· clave ••••${model.apiKeyLast4}` : '',
    model.credentialInvalidAt ? '· clave ya marcada como inválida' : '',
  ]
    .filter(Boolean)
    .join(' ');

export async function planSpecialistModels(
  request: ConduitRequest,
  botId: string,
): Promise<SpecialistModelsPlan> {
  const specialists = rows<SpecialistRow>(
    await request('GET', 'specialists?includeArchived=true'),
  );
  const models: SpecialistModelsPlan['models'] = [];
  for (const specialist of specialists) {
    const list = rows<ModelRow>(
      await request('GET', `specialists/${specialist.id}/models`),
    );
    for (const model of list) models.push({ specialist, model });
  }
  const withModels = new Set(models.map(({ specialist }) => specialist.id));
  const bindingsToTurnOff = rows<BindingRow>(
    await request('GET', `bots/${botId}/specialists`),
  ).filter(
    (binding) => binding.mode !== 'OFF' && withModels.has(binding.specialistId),
  );
  return { models, bindingsToTurnOff };
}

export async function removeSpecialistModels(options: {
  request: ConduitRequest;
  botId: string;
  apply: boolean;
  log?: (line: string) => void;
}): Promise<SpecialistModelsPlan> {
  const log = options.log ?? console.log;
  const plan = await planSpecialistModels(options.request, options.botId);

  if (plan.models.length === 0) {
    log('[modelos] Ningún especialista tiene modelos: no hay nada que borrar.');
    return plan;
  }
  for (const binding of plan.bindingsToTurnOff) {
    log(
      `[modelos] Revisión "${binding.capability}" en modo ${binding.mode}: se apagará (OFF).`,
    );
  }
  for (const { specialist, model } of plan.models) {
    log(`[modelos] Se borrará ${describeModel(specialist, model)}`);
  }
  if (!options.apply) {
    log(
      '[modelos] Simulación: ejecuta de nuevo con --apply para apagar esas revisiones y borrar los modelos.',
    );
    return plan;
  }

  for (const binding of plan.bindingsToTurnOff) {
    await options.request(
      'PUT',
      `bots/${options.botId}/specialists/${binding.capability}`,
      {
        specialistId: binding.specialistId,
        mode: 'OFF',
        ...(binding.timeoutMs !== undefined && {
          timeoutMs: binding.timeoutMs,
        }),
        ...(binding.onFailure !== undefined && {
          onFailure: binding.onFailure,
        }),
        ...(binding.blockMessage ? { blockMessage: binding.blockMessage } : {}),
      },
    );
    log(`[modelos] Revisión "${binding.capability}" apagada.`);
  }
  for (const { specialist, model } of plan.models) {
    await options.request(
      'DELETE',
      `specialists/${specialist.id}/models/${model.id}`,
    );
    log(`[modelos] Borrado ${describeModel(specialist, model)}`);
  }
  log(
    '[modelos] Listo. Cuando tengas la clave nueva, agrega los modelos y vuelve a encender las revisiones desde el panel.',
  );
  return plan;
}

async function main() {
  const { CONDUIT_BASE_URL, CONDUIT_API_KEY, CONDUIT_DEFAULT_BOT_ID } =
    process.env;
  if (!CONDUIT_BASE_URL || !CONDUIT_API_KEY || !CONDUIT_DEFAULT_BOT_ID) {
    throw new Error(
      'Faltan CONDUIT_BASE_URL, CONDUIT_API_KEY o CONDUIT_DEFAULT_BOT_ID.',
    );
  }
  console.log(`[modelos] Conduit: ${new URL(CONDUIT_BASE_URL).host}`);
  await removeSpecialistModels({
    request: conduitSeedRequest(CONDUIT_BASE_URL, CONDUIT_API_KEY),
    botId: CONDUIT_DEFAULT_BOT_ID,
    apply: process.argv.includes('--apply'),
  });
}

if (require.main === module) {
  void main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
