import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conduitSeedRequest } from './conduit-seed-request';
import { RETIRED_BUSINESS_VARIABLES } from './seed-conduit-prompt';
import {
  CONDUIT_INTENT_CATALOG,
  ConduitIntentSeed,
} from '../src/conduit/intents/conduit-intent-catalog';
import {
  CONDUIT_TOOL_CATALOG,
  ConduitToolDefinition,
} from '../src/conduit/tools/conduit-tool-catalog';
import {
  CONDUIT_TEMPLATE_CATALOG,
  ConduitTemplateDefinition,
  templateChannel,
} from '../src/conduit/templates/conduit-template-catalog';
import { CONDUIT_BOT_PROMPT_TEMPLATE } from '../src/conduit/prompt/conduit-bot-prompt';
import {
  BUSINESS_INFO_EVENT,
  BUSINESS_INFO_MAPPING_RULES,
} from '../src/business-settings/business-info';

export interface ReleaseManifest {
  id: string;
  intents: string[];
  tools: string[];
  templates: string[];
  prompt: boolean;
  mapping: boolean;
  retiredVariables: string[];
  strayIntents: string[];
}

export const SOFIA_RELEASE: ReleaseManifest = {
  id: '2026-11-19-sofia',
  intents: [
    'leo_request',
    'treatment_question',
    'booking',
    'greeting',
    'leo_notice',
    'rule.handoff',
  ],
  tools: ['recomendar_para', 'avisar_a_leo', 'pasar_a_persona'],
  templates: [
    'leonice_aviso_atencion_humana',
    'leonice_correo_aviso_atencion_humana',
  ],
  prompt: true,
  mapping: true,
  retiredVariables: RETIRED_BUSINESS_VARIABLES,
  strayIntents: ['rule.first_contact'],
};

export const GUIDANCE_RELEASE: ReleaseManifest = {
  id: '2026-11-20-orientacion',
  intents: [],
  tools: [],
  templates: [],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const HAIR_PHOTO_RELEASE: ReleaseManifest = {
  id: '2026-11-20-foto-cabello-valoracion',
  intents: [],
  tools: [],
  templates: [],
  prompt: true,
  mapping: true,
  retiredVariables: [],
  strayIntents: [],
};

export const TEAM_PRICE_RELEASE: ReleaseManifest = {
  id: '2026-11-21-precio-y-horarios',
  intents: [],
  tools: ['guardar_precio_del_equipo'],
  templates: [],
  prompt: true,
  mapping: true,
  retiredVariables: [],
  strayIntents: [],
};

export const FOLLOW_UPS_RELEASE: ReleaseManifest = {
  id: '2026-11-22-seguimientos-y-fichas',
  intents: [],
  tools: [
    'consultar_cliente',
    'consultar_disponibilidad',
    'disponibilidad_combo',
    'registrar_cliente',
    'crear_reserva_whatsapp',
  ],
  templates: [
    'leonice_recordatorio_anticipo',
    'leonice_seguimiento_interesada',
  ],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const FOLLOW_UP_TEMPLATES_RELEASE: ReleaseManifest = {
  id: '2026-11-22-plantillas-seguimiento',
  intents: [],
  tools: [],
  templates: [
    'leonice_recordatorio_anticipo',
    'leonice_seguimiento_interesada',
  ],
  prompt: false,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const CANT_MAKE_IT_RELEASE: ReleaseManifest = {
  id: '2026-11-23-no-puedo-llegar',
  intents: [],
  tools: [],
  templates: [],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const PRODUCT_PROMOTIONS_RELEASE: ReleaseManifest = {
  id: '2026-11-24-promociones-productos',
  intents: ['treatment_question', 'booking'],
  tools: [
    'promociones_vigentes',
    'info_productos',
    'solicitar_compra_producto',
    'crear_reserva_whatsapp',
  ],
  templates: [],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const PRODUCT_ORDERS_RELEASE: ReleaseManifest = {
  id: '2026-11-25-pedidos-productos',
  intents: ['treatment_question'],
  tools: [
    'solicitar_compra_producto',
    'registrar_pago_pedido',
    'depositos_pendientes',
  ],
  templates: [
    'leonice_aviso_compra_producto',
    'leonice_correo_compra_producto',
    'leonice_aviso_pago_pedido',
    'leonice_pago_pedido_rechazado',
  ],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const ASSESSMENT_FLOW_RELEASE: ReleaseManifest = {
  id: '2026-11-26-valoracion-y-precio-del-equipo',
  intents: ['treatment_question', 'booking'],
  tools: [
    'consultar_al_equipo',
    'crear_reserva_whatsapp',
    'solicitar_compra_producto',
  ],
  templates: ['leonice_pedido_listo'],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const THIRD_PARTY_BOOKING_RELEASE: ReleaseManifest = {
  id: '2026-11-27-citas-para-terceros',
  intents: [],
  tools: ['consultar_cliente', 'reservas_proximas', 'crear_reserva_whatsapp'],
  templates: [],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const OPTIONAL_BIRTH_DATE_RELEASE: ReleaseManifest = {
  id: '2026-11-28-fecha-nacimiento-opcional',
  intents: ['booking'],
  tools: ['registrar_cliente', 'crear_reserva_whatsapp'],
  templates: [],
  prompt: true,
  mapping: false,
  retiredVariables: [],
  strayIntents: [],
};

export const RELEASES: readonly ReleaseManifest[] = [
  SOFIA_RELEASE,
  GUIDANCE_RELEASE,
  HAIR_PHOTO_RELEASE,
  TEAM_PRICE_RELEASE,
  FOLLOW_UPS_RELEASE,
  FOLLOW_UP_TEMPLATES_RELEASE,
  CANT_MAKE_IT_RELEASE,
  PRODUCT_PROMOTIONS_RELEASE,
  PRODUCT_ORDERS_RELEASE,
  ASSESSMENT_FLOW_RELEASE,
  THIRD_PARTY_BOOKING_RELEASE,
  OPTIONAL_BIRTH_DATE_RELEASE,
];

export const RELEASE = RELEASES[RELEASES.length - 1];

export function releaseById(id: string | undefined): ReleaseManifest {
  if (!id) return RELEASE;
  const found = RELEASES.find((release) => release.id === id);
  if (!found) {
    throw new Error(
      `No existe la entrega ${id}. Disponibles: ${RELEASES.map((r) => r.id).join(', ')}`,
    );
  }
  return found;
}

export interface ReleaseBaseline {
  intents: Record<string, Record<string, unknown>>;
  tools: Record<string, Record<string, unknown>>;
  templates: Record<string, Record<string, unknown>>;
  prompt: string;
  mappingRules: Record<string, string>;
}

export type ItemState = 'new' | 'current' | 'pristine' | 'customized';

export interface PlanItem {
  kind: 'intención' | 'herramienta' | 'plantilla' | 'prompt' | 'mapeo';
  name: string;
  state: ItemState;
  forced: boolean;
  changed: string[];
}

const STATE_LABEL: Record<ItemState, string> = {
  new: 'nueva: se crea',
  current: 'ya está al día: no se toca',
  pristine: 'sin cambios del administrador: se actualiza',
  customized: 'personalizada en el panel: NO se toca',
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
};

const normalize = (value: unknown): unknown =>
  value === undefined ? null : canonical(JSON.parse(JSON.stringify(value)));

export function differentFields(
  remote: Record<string, unknown>,
  expected: Record<string, unknown>,
): string[] {
  return Object.keys(expected).filter(
    (key) =>
      JSON.stringify(normalize(remote[key])) !==
      JSON.stringify(normalize(expected[key])),
  );
}

export function sameFields(
  remote: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  return Object.keys(expected).every(
    (key) =>
      JSON.stringify(normalize(remote[key])) ===
      JSON.stringify(normalize(expected[key])),
  );
}

export function classify(
  remote: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
): ItemState {
  if (!remote) return 'new';
  if (sameFields(remote, next)) return 'current';
  if (previous && sameFields(remote, previous)) return 'pristine';
  return 'customized';
}

export function intentDefinition(
  intent: ConduitIntentSeed,
): Record<string, unknown> {
  const { lockedMode: _locked, ...definition } = intent;
  return definition;
}

export function toolDefinition(
  tool: ConduitToolDefinition,
): Record<string, unknown> {
  return {
    description: tool.description,
    httpMethod: tool.httpMethod,
    parametersSchema: tool.parametersSchema,
    requiresImageAttachment: tool.requiresImageAttachment ?? false,
    ...(tool.imageParamName && { imageParamName: tool.imageParamName }),
    injectPhoneParamName: tool.injectPhoneParamName ?? null,
    pausesBotMinutes: tool.pausesBotMinutes ?? null,
    pinResultInMemory: tool.pinResultInMemory ?? false,
  };
}

export function templateDefinition(
  template: ConduitTemplateDefinition,
): Record<string, unknown> {
  return {
    description: template.description,
    bodyHandlebars: template.body,
    bodyVariants: [...(template.variants ?? [])],
    ...(template.subject ? { subject: template.subject } : {}),
  };
}

function templatePayload(template: ConduitTemplateDefinition) {
  return {
    name: template.name,
    description: template.description,
    channel: templateChannel(template),
    ...(template.subject ? { subject: template.subject } : {}),
    bodyHandlebars: template.body,
    bodyVariants: [...(template.variants ?? [])],
    variadblesSchema: Object.fromEntries(
      template.variables.map((variable) => [variable, 'string']),
    ),
  };
}

const remoteTool = (tool: Record<string, unknown>) => ({
  ...tool,
  requiresImageAttachment: tool.requiresImageAttachment ?? false,
  pinResultInMemory: tool.pinResultInMemory ?? false,
});

const listOf = <T>(value: T[] | { data: T[] } | null): T[] =>
  Array.isArray(value) ? value : (value?.data ?? []);

const REQUIRED_ENV = [
  'CONDUIT_BASE_URL',
  'CONDUIT_API_KEY',
  'CONDUIT_DEFAULT_BOT_ID',
] as const;

type Request = ReturnType<typeof conduitSeedRequest>;

export interface ReleaseOptions {
  env?: NodeJS.ProcessEnv;
  request?: Request;
  baseline?: ReleaseBaseline;
  manifest?: ReleaseManifest;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface ReleaseResult {
  plan: PlanItem[];
  applied: boolean;
  backupFile: string | null;
  warnings: string[];
}

export function loadBaseline(id: string): ReleaseBaseline {
  return JSON.parse(
    readFileSync(join(__dirname, 'releases', `${id}.baseline.json`), 'utf8'),
  ) as ReleaseBaseline;
}

export async function releaseConduit(
  options: ReleaseOptions = {},
): Promise<ReleaseResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.log(line));
  const manifest = options.manifest ?? releaseById(env.CONDUIT_RELEASE_ID);
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables: ${missing.join(', ')}`);
  }
  const baseline = options.baseline ?? loadBaseline(manifest.id);
  const botId = env.CONDUIT_DEFAULT_BOT_ID!;
  const apply = env.CONDUIT_RELEASE_APPLY === 'true';
  const forced = new Set(
    (env.CONDUIT_RELEASE_FORCE ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const request =
    options.request ??
    conduitSeedRequest(env.CONDUIT_BASE_URL!, env.CONDUIT_API_KEY!);

  const pick = <T extends { name?: string; key?: string }>(
    catalog: readonly T[],
    names: string[],
    field: 'name' | 'key',
  ): T[] =>
    names.map((name) => {
      const item = catalog.find((entry) => entry[field] === name);
      if (!item) throw new Error(`${name} no está en el catálogo`);
      return item;
    });

  const intents = pick(CONDUIT_INTENT_CATALOG, manifest.intents, 'key').sort(
    (a, b) =>
      Number(b.handler === 'LLM_SLIM') - Number(a.handler === 'LLM_SLIM'),
  );
  const tools = pick(CONDUIT_TOOL_CATALOG, manifest.tools, 'name');
  const templates = pick(CONDUIT_TEMPLATE_CATALOG, manifest.templates, 'name');

  const remoteIntents = await request<Array<Record<string, unknown>>>(
    'GET',
    `bots/${botId}/intents`,
  );
  const intentByKey = new Map(remoteIntents.map((i) => [String(i.key), i]));
  const remoteTools = listOf(
    await request<
      Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }
    >('GET', `bots/${botId}/tools`),
  );
  const toolByName = new Map(remoteTools.map((t) => [String(t.name), t]));
  const remoteTemplates: Array<Record<string, unknown>> = [];
  for (let page = 1; ; page++) {
    const response = await request<{
      data: Array<Record<string, unknown>>;
      meta: { totalPages: number };
    }>('GET', `templates?limit=100&page=${page}`);
    remoteTemplates.push(...response.data);
    if (page >= response.meta.totalPages) break;
  }
  const templateByKey = new Map(
    remoteTemplates.map((t) => [`${String(t.channel)}:${String(t.name)}`, t]),
  );
  const prompt = manifest.prompt
    ? await request<{ content: string }>(
        'GET',
        `bots/${botId}/prompts/CONVERSATION`,
      )
    : null;
  const mappings = manifest.mapping
    ? listOf(
        await request<
          | Array<{ eventType: string; rules: Record<string, string> }>
          | {
              data: Array<{ eventType: string; rules: Record<string, string> }>;
            }
        >('GET', `api/external-data/${botId}/mappings`),
      )
    : [];
  const mapping = mappings.find((m) => m.eventType === BUSINESS_INFO_EVENT);
  const variables = listOf(
    await request<
      Array<{ fullKey: string }> | { data: Array<{ fullKey: string }> }
    >('GET', `api/external-data/${botId}/variables?namespace=negocio`),
  );
  const retired = manifest.retiredVariables.filter((key) =>
    variables.some((v) => v.fullKey === key),
  );

  const plan: PlanItem[] = [];
  const add = (
    kind: PlanItem['kind'],
    name: string,
    state: ItemState,
    remote?: Record<string, unknown>,
    next?: Record<string, unknown>,
  ): PlanItem => {
    const item = {
      kind,
      name,
      state,
      forced: forced.has(name),
      changed:
        state === 'customized' && remote && next
          ? differentFields(remote, next)
          : [],
    };
    plan.push(item);
    return item;
  };

  const laterNewTools = laterReleaseNewTools(manifest);
  const promptTools = manifest.prompt
    ? CONDUIT_TOOL_CATALOG.filter(
        (tool) =>
          laterNewTools.has(tool.name) &&
          CONDUIT_BOT_PROMPT_TEMPLATE.includes(tool.name) &&
          !manifest.tools.includes(tool.name) &&
          !toolByName.has(tool.name),
      )
    : [];
  const toolPlan = [...tools, ...promptTools].map((tool) => ({
    tool,
    remote: toolByName.get(tool.name),
    item: (() => {
      const remote = toolByName.has(tool.name)
        ? remoteTool(toolByName.get(tool.name)!)
        : undefined;
      const next = toolDefinition(tool);
      return add(
        'herramienta',
        tool.name,
        classify(remote, next, baseline.tools[tool.name]),
        remote,
        next,
      );
    })(),
  }));
  const intentPlan = intents.map((intent) => ({
    intent,
    item: add(
      'intención',
      intent.key,
      classify(
        intentByKey.get(intent.key),
        intentDefinition(intent),
        baseline.intents[intent.key],
      ),
      intentByKey.get(intent.key),
      intentDefinition(intent),
    ),
  }));
  const templatePlan = templates.map((template) => {
    const remote = templateByKey.get(
      `${templateChannel(template)}:${template.name}`,
    );
    return {
      template,
      remote,
      item: add(
        'plantilla',
        template.name,
        classify(
          remote,
          templateDefinition(template),
          baseline.templates[template.name],
        ),
        remote,
        templateDefinition(template),
      ),
    };
  });
  const promptItem = prompt
    ? add(
        'prompt',
        'prompt de conversación',
        prompt.content === CONDUIT_BOT_PROMPT_TEMPLATE
          ? 'current'
          : prompt.content === baseline.prompt
            ? 'pristine'
            : 'customized',
      )
    : null;
  const sameRules = (rules: Record<string, string>) =>
    JSON.stringify(Object.entries(rules).sort());
  const mappingItem = manifest.mapping
    ? add(
        'mapeo',
        BUSINESS_INFO_EVENT,
        !mapping
          ? 'new'
          : sameRules(mapping.rules) === sameRules(BUSINESS_INFO_MAPPING_RULES)
            ? 'current'
            : sameRules(mapping.rules) === sameRules(baseline.mappingRules)
              ? 'pristine'
              : 'customized',
      )
    : null;

  const warnings: string[] = [];
  for (const key of manifest.strayIntents) {
    const stray = intentByKey.get(key);
    if (stray) {
      warnings.push(
        `la intención ${key} existe (modo ${String(stray.mode)}) y ya no está en el catálogo: apágala en el panel si está activa.`,
      );
    }
  }

  log(
    `[release ${manifest.id}] ${apply ? 'APLICANDO' : 'SIMULACIÓN (no cambia nada)'}`,
  );
  for (const item of plan) {
    log(
      `  ${item.kind} ${item.name}: ${STATE_LABEL[item.state]}${item.changed.length > 0 ? ` (cambió: ${item.changed.join(', ')})` : ''}${item.state === 'customized' && item.forced ? ' → FORZADA: se reemplaza' : ''}`,
    );
  }
  if (retired.length > 0) {
    log(`  datos retirados del bot que se borran: ${retired.join(', ')}`);
  }
  for (const warning of warnings) log(`  ⚠ ${warning}`);

  const writes = (item: PlanItem | null) =>
    item !== null &&
    (item.state === 'new' ||
      item.state === 'pristine' ||
      (item.state === 'customized' && item.forced));

  if (!apply) {
    log(
      '  Para aplicar: CONDUIT_RELEASE_APPLY=true. Una personalizada solo se reemplaza si la nombras en CONDUIT_RELEASE_FORCE.',
    );
    return { plan, applied: false, backupFile: null, warnings };
  }

  const backup = {
    release: manifest.id,
    takenAt: (options.now ?? (() => new Date()))().toISOString(),
    intents: Object.fromEntries(
      intentPlan
        .filter(({ item }) => writes(item) && item.state !== 'new')
        .map(({ intent }) => [intent.key, intentByKey.get(intent.key)]),
    ),
    tools: Object.fromEntries(
      toolPlan
        .filter(({ item }) => writes(item) && item.state !== 'new')
        .map(({ tool, remote }) => [tool.name, remote]),
    ),
    templates: Object.fromEntries(
      templatePlan
        .filter(({ item }) => writes(item) && item.state !== 'new')
        .map(({ template, remote }) => [template.name, remote]),
    ),
    prompt: writes(promptItem) ? prompt?.content : undefined,
    mapping: writes(mappingItem) ? mapping : undefined,
    retiredVariables: retired,
  };
  const dir = env.CONDUIT_RELEASE_BACKUP_DIR ?? 'conduit-release-backups';
  mkdirSync(dir, { recursive: true });
  const backupFile = join(
    dir,
    `${manifest.id}-${backup.takenAt.replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  log(`  copia de lo que había antes: ${backupFile}`);

  for (const { tool, remote, item } of toolPlan) {
    if (!writes(item)) continue;
    if (!remote) {
      if (!env.CONDUIT_TOOL_API_KEY || !env.CONDUIT_TOOLS_PUBLIC_URL) {
        throw new Error(
          `Para crear ${tool.name} faltan CONDUIT_TOOL_API_KEY y CONDUIT_TOOLS_PUBLIC_URL`,
        );
      }
      await request('POST', `bots/${botId}/tools`, {
        name: tool.name,
        ...definedOnly(toolDefinition(tool)),
        endpointUrl: `${env.CONDUIT_TOOLS_PUBLIC_URL.replace(/\/+$/, '')}${tool.path}`,
        authHeaderName: 'x-api-key',
        authSecret: env.CONDUIT_TOOL_API_KEY,
        isActive: true,
      });
    } else {
      await request(
        'PATCH',
        `bots/${botId}/tools/${String(remote.id)}`,
        definedOnly(toolDefinition(tool)),
      );
    }
    log(`  herramienta ${tool.name}: ${remote ? 'actualizada' : 'creada'}`);
  }

  for (const { intent, item } of intentPlan) {
    if (!writes(item)) continue;
    const mode =
      item.state === 'new'
        ? (intent.lockedMode ?? 'SHADOW')
        : intent.lockedMode;
    await request('PUT', `bots/${botId}/intents/${intent.key}`, {
      ...intentDefinition(intent),
      ...(mode && { mode }),
    });
    log(
      `  intención ${intent.key}: ${item.state === 'new' ? `creada (${mode})` : 'actualizada (conserva su modo)'}`,
    );
  }

  for (const { template, remote, item } of templatePlan) {
    if (!writes(item)) continue;
    if (remote) {
      await request(
        'PUT',
        `templates/${String(remote.id)}`,
        templateDefinition(template),
      );
    } else {
      await request('POST', 'templates', templatePayload(template));
    }
    log(`  plantilla ${template.name}: ${remote ? 'actualizada' : 'creada'}`);
  }

  if (writes(promptItem)) {
    await request('PUT', `bots/${botId}/prompts/CONVERSATION`, {
      content: CONDUIT_BOT_PROMPT_TEMPLATE,
    });
    log(
      '  prompt de conversación: actualizado (los ajustes del panel se conservan)',
    );
  }

  if (writes(mappingItem)) {
    await request(
      'POST',
      `api/external-data/${botId}/mappings/${BUSINESS_INFO_EVENT}`,
      {
        rules: BUSINESS_INFO_MAPPING_RULES,
        description:
          'Información del negocio (anticipo, pagos, políticas, dirección y horario) para el prompt del asistente.',
      },
    );
    log(`  mapeo ${BUSINESS_INFO_EVENT}: actualizado`);
  }

  if (retired.length > 0) {
    await request(
      'DELETE',
      `api/external-data/${botId}/variables?keys=${retired.map(encodeURIComponent).join(',')}`,
    );
    log(`  datos retirados: ${retired.join(', ')}`);
  }

  return { plan, applied: true, backupFile, warnings };
}

function laterReleaseNewTools(manifest: ReleaseManifest): Set<string> {
  const index = RELEASES.findIndex((release) => release.id === manifest.id);
  const later = index === -1 ? [] : RELEASES.slice(index + 1);
  const names = new Set<string>();
  for (const release of later) {
    const existed = loadBaseline(release.id).tools;
    for (const name of release.tools) {
      if (!(name in existed)) names.add(name);
    }
  }
  return names;
}

function definedOnly(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}

if (require.main === module) {
  releaseConduit().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
