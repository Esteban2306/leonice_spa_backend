import { conduitSeedRequest } from './conduit-seed-request';
import {
  CONDUIT_BOT_PROMPT_TEMPLATE,
  CONDUIT_BOT_SETTINGS,
} from '../src/conduit/prompt/conduit-bot-prompt';
import {
  BUSINESS_INFO_EVENT,
  BUSINESS_INFO_MAPPING_RULES,
} from '../src/business-settings/business-info';

interface PromptView {
  content: string;
  isCustom: boolean;
}

interface SettingsView {
  configured: boolean;
}

interface MappingView {
  eventType: string;
  rules: Record<string, string>;
}

const REQUIRED_ENV = [
  'CONDUIT_BASE_URL',
  'CONDUIT_API_KEY',
  'CONDUIT_DEFAULT_BOT_ID',
] as const;

const sameRules = (a: Record<string, string>, b: Record<string, string>) =>
  JSON.stringify(Object.entries(a).sort()) ===
  JSON.stringify(Object.entries(b).sort());

export async function seedConduitPrompt(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.log(`[conduit] Prompt omitido: faltan ${missing.join(', ')}.`);
    return;
  }
  const botId = env.CONDUIT_DEFAULT_BOT_ID!;
  const overwrite = env.CONDUIT_PROMPT_OVERWRITE === 'true';
  const request = conduitSeedRequest(
    env.CONDUIT_BASE_URL!,
    env.CONDUIT_API_KEY!,
  );

  const prompt = await request<PromptView>(
    'GET',
    `bots/${botId}/prompts/CONVERSATION`,
  );
  if (prompt.content === CONDUIT_BOT_PROMPT_TEMPLATE) {
    console.log('[conduit] prompt de conversación: ya estaba');
  } else if (!prompt.isCustom || overwrite) {
    await request('PUT', `bots/${botId}/prompts/CONVERSATION`, {
      content: CONDUIT_BOT_PROMPT_TEMPLATE,
    });
    console.log('[conduit] prompt de conversación: guardado');
  } else {
    console.warn(
      '[conduit]   ⚠ el bot tiene un prompt personalizado distinto; no se reemplazó (CONDUIT_PROMPT_OVERWRITE=true para reemplazarlo).',
    );
  }

  const settings = await request<SettingsView>(
    'GET',
    `bots/${botId}/prompts/settings`,
  );
  if (!settings.configured || overwrite) {
    await request('PUT', `bots/${botId}/prompts/settings`, {
      ...CONDUIT_BOT_SETTINGS,
    });
    console.log('[conduit] ajustes del asistente: guardados');
  } else {
    console.log(
      '[conduit] ajustes del asistente: ya configurados (se conservan)',
    );
  }

  const mappings = await request<MappingView[] | { data: MappingView[] }>(
    'GET',
    `api/external-data/${botId}/mappings`,
  );
  const list = Array.isArray(mappings) ? mappings : mappings.data;
  const current = list.find((m) => m.eventType === BUSINESS_INFO_EVENT);
  if (current && sameRules(current.rules, BUSINESS_INFO_MAPPING_RULES)) {
    console.log(`[conduit] hook ${BUSINESS_INFO_EVENT}: ya estaba`);
  } else if (!current || overwrite) {
    await request(
      'POST',
      `api/external-data/${botId}/mappings/${BUSINESS_INFO_EVENT}`,
      {
        rules: BUSINESS_INFO_MAPPING_RULES,
        description:
          'Información del negocio (anticipo, pagos, políticas, dirección y horario) para el prompt del asistente.',
      },
    );
    console.log(`[conduit] hook ${BUSINESS_INFO_EVENT}: guardado`);
  } else {
    console.warn(
      `[conduit]   ⚠ el hook ${BUSINESS_INFO_EVENT} tiene un mapeo distinto; no se reemplazó (CONDUIT_PROMPT_OVERWRITE=true).`,
    );
  }
}

if (require.main === module) {
  seedConduitPrompt().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
