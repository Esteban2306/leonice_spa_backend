import { conduitSeedRequest } from './conduit-seed-request';

const REQUIRED_ENV = [
  'CONDUIT_BASE_URL',
  'CONDUIT_API_KEY',
  'CONDUIT_DEFAULT_BOT_ID',
] as const;

const SPECIALIST_KEY = 'comprobante-anticipo';
const CAPABILITY = 'image-analysis';
const DEFAULT_PRIMARY_MODEL = 'claude-haiku-5-5';
const DEFAULT_FALLBACK_MODEL = 'claude-sonnet-5-5';

const PROMPT_TEMPLATE = [
  'Analizas fotos de comprobantes de transferencia (Nequi, Bancolombia u otros bancos de Colombia) que las clientas de un spa envían como pago de un anticipo.',
  'Lee solo lo que se vea en la imagen. No inventes ni completes datos. Si un dato no aparece, o aparece tapado o incompleto, déjalo vacío.',
  'El monto va en pesos colombianos y sin símbolo: "$20.000" o "20.000,00" se escribe 20000 (el punto separa miles).',
  'La cuenta destino es el número de celular o de cuenta al que se envió el dinero, completo y solo con dígitos. Si solo se ve una parte (por ejemplo "****5235"), déjala vacía.',
  'El destinatario es el nombre de quien recibe el dinero, tal como aparece.',
  'La referencia es el número de aprobación, comprobante o referencia de la transacción.',
  'La fecha es la de la transacción, en formato AAAA-MM-DD.',
  'Si la imagen no es un comprobante de transferencia o de pago (por ejemplo una foto personal, una captura de conversación o un paisaje), marca que no es el documento esperado.',
  'Si es un comprobante pero se lee mal, refleja esa dificultad en la legibilidad.',
].join('\n');

const OUTPUT_SCHEMA = {
  version: 1,
  variables: [
    {
      name: 'amount',
      type: 'number',
      min: 0,
      max: 1_000_000_000,
      tolerance: 0.005,
      label: 'monto',
      description:
        'Monto transferido en pesos colombianos, solo el número sin símbolos ni puntos de miles',
    },
    {
      name: 'destination',
      type: 'string',
      maxLength: 30,
      label: 'cuenta destino',
      description:
        'Número de celular o de cuenta que recibió el dinero, completo y solo dígitos; vacío si está tapado o incompleto',
    },
    {
      name: 'recipient',
      type: 'string',
      maxLength: 120,
      label: 'destinatario',
      description: 'Nombre de quien recibe el dinero',
    },
    {
      name: 'reference',
      type: 'string',
      maxLength: 64,
      identityMinLength: 5,
      label: 'referencia',
      description: 'Número de aprobación o referencia de la transacción',
    },
    {
      name: 'date',
      type: 'date',
      label: 'fecha',
      description: 'Fecha de la transacción en formato YYYY-MM-DD',
    },
  ],
  uniqueBy: ['reference', 'amount', 'date'],
};

const RULES = {
  version: 1,
  rules: [
    {
      field: 'amount',
      op: 'gte',
      ref: 'grounding.minimo',
      onFail: 'INVALID',
    },
    {
      field: 'destination',
      op: 'within',
      ref: 'grounding.instrucciones',
      onFail: 'INVALID',
    },
    {
      field: 'date',
      op: 'within_days',
      ref: { literal: 2 },
      onFail: 'INVALID',
    },
  ],
};

const CONTEXT_SOURCES = {
  version: 1,
  sources: [
    {
      key: 'minimo',
      kind: 'TOOL',
      name: 'info_negocio',
      valuePath: 'depositAmountCop',
      maxAgeSeconds: 60,
      required: true,
    },
    {
      key: 'instrucciones',
      kind: 'TOOL',
      name: 'info_negocio',
      valuePath: 'depositInstructions',
      maxAgeSeconds: 60,
      required: true,
    },
  ],
};

export const SPECIALIST_DEFINITION = {
  name: 'Comprobante de anticipo',
  promptTemplate: PROMPT_TEMPLATE,
  outputSchema: OUTPUT_SCHEMA,
  rules: RULES,
  contextSources: CONTEXT_SOURCES,
};

export const HAIR_SPECIALIST_KEY = 'foto-cabello';
export const HAIR_CAPABILITY = 'foto-cabello';

export const HAIR_SPECIALIST_DEFINITION = {
  name: 'Foto del cabello',
  promptTemplate: [
    'Revisas fotos que las clientas de un spa capilar envían por WhatsApp. Solo decides si la foto muestra el cabello o el cuero cabelludo de una persona: para pedir una valoración, mostrar cómo lo tiene, una referencia de cómo lo quiere o cómo le quedó.',
    'Si el cabello o el cuero cabelludo de una persona se ve y es lo principal de la foto, es el contenido esperado y la legibilidad es CLEAR, aunque la foto esté algo oscura, borrosa o de lado.',
    'No es el contenido esperado: un comprobante de pago, una captura de pantalla o de una conversación, un texto, un producto, un paisaje, o una foto donde el cabello no es lo principal (por ejemplo una selfie lejana o un grupo de personas).',
    'En la descripción pon en pocas palabras lo que se ve del cabello (largo, color, si parece tinturado, alisado o maltratado). No opines, no diagnostiques y no describas la cara ni otros datos de la persona.',
  ].join('\n'),
  outputSchema: {
    version: 1,
    variables: [
      {
        name: 'descripcion',
        type: 'string',
        maxLength: 160,
        label: 'lo que se ve',
        description:
          'Lo que se ve del cabello en pocas palabras, sin opiniones ni datos de la persona',
      },
    ],
    uniqueBy: [],
  },
  rules: { version: 1, rules: [] },
  contextSources: { version: 1, sources: [] },
};

interface SpecialistSeed {
  key: string;
  capability: string;
  definition: typeof SPECIALIST_DEFINITION | typeof HAIR_SPECIALIST_DEFINITION;
  overwriteEnv: string;
  modeEnv: string;
  defaultMode: 'OFF' | 'SHADOW' | 'ACTIVE';
}

const RECEIPT_SEED: SpecialistSeed = {
  key: SPECIALIST_KEY,
  capability: CAPABILITY,
  definition: SPECIALIST_DEFINITION,
  overwriteEnv: 'CONDUIT_SPECIALIST_OVERWRITE',
  modeEnv: 'CONDUIT_SPECIALIST_MODE',
  defaultMode: 'ACTIVE',
};

const HAIR_SEED: SpecialistSeed = {
  key: HAIR_SPECIALIST_KEY,
  capability: HAIR_CAPABILITY,
  definition: HAIR_SPECIALIST_DEFINITION,
  overwriteEnv: 'CONDUIT_HAIR_SPECIALIST_OVERWRITE',
  modeEnv: 'CONDUIT_HAIR_SPECIALIST_MODE',
  defaultMode: 'SHADOW',
};

interface RemoteSpecialist {
  id: string;
  version: number;
  status: string;
}

interface RemoteModel {
  model: string;
  role: string;
}

interface RemoteBinding {
  capability: string;
  mode: string;
  specialist?: { id: string };
  specialistId?: string;
}

const isNotFound = (error: unknown) =>
  error instanceof Error && error.message.includes('HTTP 404');

const asList = <T>(value: T[] | { data: T[] }): T[] =>
  Array.isArray(value) ? value : value.data;

export async function seedConduitSpecialist(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (await seedSpecialist(RECEIPT_SEED, env)) {
    await enableImages(env);
  }
}

export async function seedConduitHairSpecialist(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await seedSpecialist(HAIR_SEED, env);
}

async function seedSpecialist(
  seed: SpecialistSeed,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const { key, capability, definition } = seed;
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.log(
      `[conduit] Especialista omitido: faltan ${missing.join(', ')}.`,
    );
    return false;
  }
  const botId = env.CONDUIT_DEFAULT_BOT_ID!;
  const overwrite = env[seed.overwriteEnv] === 'true';
  const mode = env[seed.modeEnv] ?? seed.defaultMode;
  if (!['OFF', 'SHADOW', 'ACTIVE'].includes(mode)) {
    throw new Error(`${seed.modeEnv} inválido: ${mode}`);
  }
  const request = conduitSeedRequest(
    env.CONDUIT_BASE_URL!,
    env.CONDUIT_API_KEY!,
  );

  let specialist: RemoteSpecialist;
  try {
    specialist = await request<RemoteSpecialist>(
      'GET',
      `specialists/by-key/${key}`,
    );
    if (overwrite) {
      specialist = await request<RemoteSpecialist>(
        'PATCH',
        `specialists/${specialist.id}`,
        { ...definition, expectedVersion: specialist.version },
      );
      console.log(`[conduit] especialista ${key}: actualizado`);
    } else {
      console.log(
        `[conduit] especialista ${key}: ya existía (${seed.overwriteEnv}=true para reemplazar su definición)`,
      );
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
    specialist = await request<RemoteSpecialist>('POST', 'specialists', {
      key,
      capability,
      ...definition,
    });
    console.log(`[conduit] especialista ${key}: creado`);
    specialist = await request<RemoteSpecialist>(
      'PATCH',
      `specialists/${specialist.id}`,
      { status: 'ACTIVE' },
    );
    console.log(`[conduit] especialista ${key}: activado`);
  }

  const modelKey = env.CONDUIT_SPECIALIST_MODEL_KEY;
  if (!modelKey) {
    console.warn(
      '[conduit]   ⚠ sin CONDUIT_SPECIALIST_MODEL_KEY no se crean los modelos del especialista (un especialista nunca usa las claves del sistema).',
    );
  } else {
    const existing = asList(
      await request<RemoteModel[] | { data: RemoteModel[] }>(
        'GET',
        `specialists/${specialist.id}/models`,
      ),
    );
    const wanted = [
      {
        model: env.CONDUIT_SPECIALIST_MODEL ?? DEFAULT_PRIMARY_MODEL,
        role: 'IMAGE_ANALYSIS',
        priority: 1,
      },
      {
        model: env.CONDUIT_SPECIALIST_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL,
        role: 'FALLBACK',
        priority: 2,
      },
    ].filter((entry) => entry.model.toLowerCase() !== 'none');

    for (const entry of wanted) {
      if (
        existing.some((m) => m.model === entry.model && m.role === entry.role)
      ) {
        console.log(
          `[conduit] modelo ${entry.role} ${entry.model}: ya existía`,
        );
        continue;
      }
      await request('POST', `specialists/${specialist.id}/models`, {
        provider: 'ANTHROPIC',
        model: entry.model,
        apiKey: modelKey,
        role: entry.role,
        tier: 'PAID',
        priority: entry.priority,
      });
      console.log(`[conduit] modelo ${entry.role} ${entry.model}: creado`);
    }
  }

  const bindings = asList(
    await request<RemoteBinding[] | { data: RemoteBinding[] }>(
      'GET',
      `bots/${botId}/specialists`,
    ),
  );
  const current = bindings.find((b) => b.capability === capability);
  const currentSpecialist = current?.specialist?.id ?? current?.specialistId;
  if (current && currentSpecialist !== specialist.id && !overwrite) {
    console.warn(
      `[conduit]   ⚠ el bot ya tiene otro especialista en ${capability}; no se reemplazó (${seed.overwriteEnv}=true).`,
    );
  } else if (current && currentSpecialist === specialist.id && !overwrite) {
    console.log(
      `[conduit] vínculo ${capability}: ya existía (${current.mode})`,
    );
  } else {
    try {
      const result = await request<{ warnings?: Array<{ message: string }> }>(
        'PUT',
        `bots/${botId}/specialists/${capability}`,
        {
          specialistId: specialist.id,
          mode,
          timeoutMs: 12000,
          onFailure: 'DEGRADE',
        },
      );
      console.log(`[conduit] vínculo ${capability}: ${mode}`);
      for (const warning of result?.warnings ?? []) {
        console.warn(`[conduit]   ⚠ ${warning.message}`);
      }
    } catch (error) {
      console.warn(
        `[conduit]   ⚠ no se pudo vincular en ${mode}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return true;
}

async function enableImages(env: NodeJS.ProcessEnv): Promise<void> {
  const botId = env.CONDUIT_DEFAULT_BOT_ID!;
  const request = conduitSeedRequest(
    env.CONDUIT_BASE_URL!,
    env.CONDUIT_API_KEY!,
  );
  if (env.CONDUIT_SPECIALIST_ENABLE_IMAGES === 'true') {
    await request('PUT', `bot/config/${botId}`, { imageAnalysisEnabled: true });
    console.log('[conduit] análisis de imágenes del bot: activado');
  } else {
    console.log(
      '[conduit] análisis de imágenes del bot: sin cambios (CONDUIT_SPECIALIST_ENABLE_IMAGES=true para activarlo)',
    );
  }
}

if (require.main === module) {
  const run = process.argv.includes(HAIR_SPECIALIST_KEY)
    ? seedConduitHairSpecialist
    : seedConduitSpecialist;
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
