import { conduitSeedRequest } from './conduit-seed-request';
import {
  CONDUIT_INTENT_CATALOG,
  ConduitIntentSeed,
} from '../src/conduit/intents/conduit-intent-catalog';

interface RemoteIntent {
  key: string;
  mode: string;
}

const REQUIRED_ENV = [
  'CONDUIT_BASE_URL',
  'CONDUIT_API_KEY',
  'CONDUIT_DEFAULT_BOT_ID',
] as const;

const MODES = ['OFF', 'SHADOW', 'ACTIVE'] as const;
type Mode = (typeof MODES)[number];

/**
 * Siembra las intenciones del spa en Conduit (reglas sin IA, plantillas,
 * llamadas directas y flujos de IA reducida).
 *
 * - Una intención nueva nace en SOMBRA (clasifica y registra, no responde)
 *   salvo que CONDUIT_INTENTS_MODE indique otro modo.
 * - Una que ya existe no se toca; con CONDUIT_INTENTS_OVERWRITE=true se
 *   reemplaza su definición (frases, textos, herramienta). El modo que
 *   eligió el operador se conserva, salvo que CONDUIT_INTENTS_MODE esté
 *   definido explícitamente.
 * - Las marcadas `lockedMode` (p. ej. medios de pago, con texto genérico
 *   pendiente) nunca pasan de SOMBRA desde este seed.
 */
export async function seedConduitIntents(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.log(
      `[conduit] Intenciones omitidas: faltan ${missing.join(', ')}.`,
    );
    return;
  }
  const botId = env.CONDUIT_DEFAULT_BOT_ID!;
  const overwrite = env.CONDUIT_INTENTS_OVERWRITE === 'true';
  const requested = env.CONDUIT_INTENTS_MODE as Mode | undefined;
  if (requested && !MODES.includes(requested)) {
    throw new Error(`CONDUIT_INTENTS_MODE inválido: ${requested}`);
  }

  const request = conduitSeedRequest(
    env.CONDUIT_BASE_URL!,
    env.CONDUIT_API_KEY!,
  );
  const listed = await request<RemoteIntent[]>('GET', `bots/${botId}/intents`);
  const existing = new Map(listed.map((intent) => [intent.key, intent]));

  const payload = (intent: ConduitIntentSeed, includeMode: boolean) => {
    const { lockedMode, ...definition } = intent;
    const mode = lockedMode ?? requested ?? 'SHADOW';
    return { ...definition, ...(includeMode && { mode }) };
  };

  // Las de IA reducida primero: otras intenciones pueden apuntarles (fallbackTo).
  const ordered = [...CONDUIT_INTENT_CATALOG].sort(
    (a, b) =>
      Number(b.handler === 'LLM_SLIM') - Number(a.handler === 'LLM_SLIM'),
  );

  for (const intent of ordered) {
    const current = existing.get(intent.key);
    if (!current) {
      await request(
        'PUT',
        `bots/${botId}/intents/${intent.key}`,
        payload(intent, true),
      );
      console.log(
        `[conduit] intención ${intent.key}: creada (${intent.lockedMode ?? requested ?? 'SHADOW'})`,
      );
      continue;
    }
    if (!overwrite) {
      console.log(
        `[conduit] intención ${intent.key}: ya existía (${current.mode})`,
      );
      continue;
    }
    await request(
      'PUT',
      `bots/${botId}/intents/${intent.key}`,
      payload(intent, Boolean(requested || intent.lockedMode)),
    );
    console.log(`[conduit] intención ${intent.key}: actualizada`);
  }

  const known = new Set(CONDUIT_INTENT_CATALOG.map((i) => i.key));
  for (const remote of listed.filter((i) => !known.has(i.key))) {
    console.warn(
      `[conduit]   ⚠ la intención ${remote.key} no está en el catálogo del spa; revisa si sobra.`,
    );
  }
  const pending = CONDUIT_INTENT_CATALOG.filter((i) =>
    i.notes?.startsWith('PENDIENTE'),
  );
  for (const intent of pending) {
    console.warn(`[conduit]   ⚠ ${intent.key}: ${intent.notes}`);
  }
}

if (require.main === module) {
  seedConduitIntents().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
