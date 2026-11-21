import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GUIDANCE_RELEASE,
  HAIR_PHOTO_RELEASE,
  TEAM_PRICE_RELEASE,
  FOLLOW_UPS_RELEASE,
  CANT_MAKE_IT_RELEASE,
  SOFIA_RELEASE as RELEASE,
  intentDefinition,
  loadBaseline,
  releaseConduit,
  templateDefinition,
  toolDefinition,
} from '../../prisma/release-conduit';
import { CONDUIT_INTENT_CATALOG } from './intents/conduit-intent-catalog';
import { CONDUIT_TOOL_CATALOG } from './tools/conduit-tool-catalog';
import {
  CONDUIT_TEMPLATE_CATALOG,
  templateChannel,
} from './templates/conduit-template-catalog';
import { CONDUIT_BOT_PROMPT_TEMPLATE } from './prompt/conduit-bot-prompt';
import { BUSINESS_INFO_MAPPING_RULES } from '../business-settings/business-info';

const baseline = loadBaseline(RELEASE.id);

function productionLike() {
  const intents = RELEASE.intents
    .filter((key) => key !== 'leo_request')
    .map((key) => ({
      id: key,
      key,
      mode: key === 'booking' ? 'OFF' : 'ACTIVE',
      version: 2,
      ...baseline.intents[key],
    }));
  intents.push({
    id: 'fc',
    key: 'rule.first_contact',
    mode: 'ACTIVE',
    version: 1,
  });
  const tools = [
    {
      id: 't-pasar',
      name: 'pasar_a_persona',
      isActive: false,
      endpointUrl: 'https://spa/api/v1/conduit/handoff',
      ...baseline.tools.pasar_a_persona,
      description: 'Texto propio del administrador',
    },
  ];
  const templates = CONDUIT_TEMPLATE_CATALOG.filter((t) =>
    RELEASE.templates.includes(t.name),
  ).map((t) => ({
    id: `tpl-${t.name}`,
    name: t.name,
    channel: templateChannel(t),
    ...baseline.templates[t.name],
  }));
  return {
    intents,
    tools,
    templates,
    prompt: baseline.prompt,
    mapping: {
      eventType: 'business.info.updated',
      rules: baseline.mappingRules,
    },
    variables: [
      { fullKey: 'negocio.whatsapp_de_leo' },
      { fullKey: 'negocio.direccion' },
    ],
  };
}

function fakeConduit(state = productionLike()) {
  const writes: Array<{ method: string; path: string; body?: unknown }> = [];
  const request = jest.fn((method: string, path: string, body?: unknown) => {
    if (method !== 'GET') {
      writes.push({ method, path, body });
      return Promise.resolve(null);
    }
    if (path.endsWith('/intents')) return Promise.resolve(state.intents);
    if (path.endsWith('/tools')) return Promise.resolve({ data: state.tools });
    if (path.startsWith('templates?'))
      return Promise.resolve({
        data: state.templates,
        meta: { totalPages: 1 },
      });
    if (path.endsWith('/prompts/CONVERSATION'))
      return Promise.resolve({ content: state.prompt, isCustom: true });
    if (path.endsWith('/mappings')) return Promise.resolve([state.mapping]);
    if (path.includes('/variables')) return Promise.resolve(state.variables);
    return Promise.reject(new Error(`ruta inesperada ${path}`));
  });
  return { request, writes };
}

const env = (extra: Record<string, string> = {}) => ({
  CONDUIT_BASE_URL: 'http://conduit.test',
  CONDUIT_API_KEY: 'k',
  CONDUIT_DEFAULT_BOT_ID: 'bot',
  CONDUIT_TOOL_API_KEY: 'tool-key',
  CONDUIT_TOOLS_PUBLIC_URL: 'https://spa/api/v1',
  CONDUIT_RELEASE_BACKUP_DIR: mkdtempSync(join(tmpdir(), 'release-')),
  ...extra,
});

describe('despliegue selectivo de Conduit', () => {
  it('la foto anterior trae solo lo que esta entrega cambia', () => {
    expect(Object.keys(baseline.intents).sort()).toEqual(
      RELEASE.intents.filter((k) => k !== 'leo_request').sort(),
    );
    expect(Object.keys(baseline.tools)).toEqual(['pasar_a_persona']);
    expect(baseline.prompt).not.toBe(CONDUIT_BOT_PROMPT_TEMPLATE);
    expect(baseline.mappingRules).not.toEqual(BUSINESS_INFO_MAPPING_RULES);
  });

  it('en simulación no escribe nada y explica qué haría', async () => {
    const { request, writes } = fakeConduit();
    const lines: string[] = [];
    const out = await releaseConduit({
      manifest: RELEASE,
      env: env(),
      request: request as never,
      log: (l) => lines.push(l),
    });
    expect(out.applied).toBe(false);
    expect(writes).toEqual([]);
    const state = Object.fromEntries(out.plan.map((p) => [p.name, p.state]));
    expect(state).toMatchObject({
      leo_request: 'new',
      recomendar_para: 'new',
      avisar_a_leo: 'new',
      booking: 'pristine',
      pasar_a_persona: 'customized',
      leonice_aviso_atencion_humana: 'pristine',
      'prompt de conversación': 'pristine',
      'business.info.updated': 'pristine',
    });
    expect(lines.join('\n')).toContain(
      'pasar_a_persona: personalizada en el panel: NO se toca (cambió: description)',
    );
    expect(out.warnings[0]).toContain('rule.first_contact');
  });

  it('al aplicar respeta lo personalizado y el modo elegido, y guarda copia de lo anterior', async () => {
    const { request, writes } = fakeConduit();
    const vars = env({ CONDUIT_RELEASE_APPLY: 'true' });
    const out = await releaseConduit({
      manifest: RELEASE,
      env: vars,
      request: request as never,
      log: () => undefined,
    });
    expect(writes.some((w) => w.path.includes('t-pasar'))).toBe(false);

    const booking = writes.find((w) => w.path === 'bots/bot/intents/booking');
    expect(booking?.body).toEqual(
      intentDefinition(
        CONDUIT_INTENT_CATALOG.find((i) => i.key === 'booking')!,
      ),
    );
    const leo = writes.find((w) => w.path === 'bots/bot/intents/leo_request');
    expect(leo?.body).toMatchObject({ mode: 'ACTIVE' });

    const created = writes.find(
      (w) => w.method === 'POST' && w.path === 'bots/bot/tools',
    );
    expect(created?.body).toMatchObject({
      name: 'recomendar_para',
      endpointUrl: 'https://spa/api/v1/conduit/recommendations',
      isActive: true,
    });

    const template = CONDUIT_TEMPLATE_CATALOG.find(
      (t) => t.name === 'leonice_aviso_atencion_humana',
    )!;
    expect(
      writes.find(
        (w) => w.path === 'templates/tpl-leonice_aviso_atencion_humana',
      )?.body,
    ).toEqual(templateDefinition(template));

    expect(
      writes.find((w) => w.path === 'bots/bot/prompts/CONVERSATION')?.body,
    ).toEqual({ content: CONDUIT_BOT_PROMPT_TEMPLATE });
    expect(writes.some((w) => w.path.includes('prompts/settings'))).toBe(false);
    expect(
      writes.find((w) => w.path.includes('/mappings/'))?.body,
    ).toMatchObject({ rules: BUSINESS_INFO_MAPPING_RULES });
    expect(writes.find((w) => w.method === 'DELETE')?.path).toBe(
      'api/external-data/bot/variables?keys=negocio.whatsapp_de_leo',
    );

    const backup = JSON.parse(readFileSync(out.backupFile!, 'utf8')) as {
      prompt: string;
      intents: Record<string, unknown>;
      tools: Record<string, unknown>;
    };
    expect(backup.prompt).toBe(baseline.prompt);
    expect(Object.keys(backup.intents)).toContain('booking');
    expect(backup.tools).toEqual({});
    expect(readdirSync(vars.CONDUIT_RELEASE_BACKUP_DIR)).toHaveLength(1);
  });

  it('lo que ya está al día no se vuelve a escribir', async () => {
    const state = productionLike();
    state.intents = RELEASE.intents.map((key) => ({
      id: key,
      key,
      mode: 'ACTIVE',
      version: 3,
      ...intentDefinition(CONDUIT_INTENT_CATALOG.find((i) => i.key === key)!),
    }));
    state.tools = CONDUIT_TOOL_CATALOG.filter((t) =>
      RELEASE.tools.includes(t.name),
    ).map((t) => ({
      id: t.name,
      name: t.name,
      isActive: true,
      endpointUrl: '',
      imageParamName: 'imageBase64',
      ...toolDefinition(t),
    })) as never;
    state.templates = state.templates.map((t) => ({
      ...t,
      ...templateDefinition(
        CONDUIT_TEMPLATE_CATALOG.find((c) => c.name === t.name)!,
      ),
    }));
    state.prompt = CONDUIT_BOT_PROMPT_TEMPLATE;
    state.mapping.rules = BUSINESS_INFO_MAPPING_RULES;
    state.variables = [];
    const { request, writes } = fakeConduit(state);
    const out = await releaseConduit({
      manifest: RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(out.plan.every((p) => p.state === 'current')).toBe(true);
    expect(writes).toEqual([]);
  });

  it('una personalizada solo se reemplaza si se nombra', async () => {
    const { request, writes } = fakeConduit();
    await releaseConduit({
      manifest: RELEASE,
      env: env({
        CONDUIT_RELEASE_APPLY: 'true',
        CONDUIT_RELEASE_FORCE: 'pasar_a_persona',
      }),
      request: request as never,
      log: () => undefined,
    });
    const patch = writes.find((w) => w.path === 'bots/bot/tools/t-pasar');
    expect(patch?.body).not.toHaveProperty('isActive');
    expect(patch?.body).not.toHaveProperty('endpointUrl');
    expect(patch?.body).toMatchObject({
      description: CONDUIT_TOOL_CATALOG.find(
        (t) => t.name === 'pasar_a_persona',
      )!.description,
    });
  });
});

describe('entrega de orientación (solo el prompt)', () => {
  const guidance = loadBaseline(GUIDANCE_RELEASE.id);

  it('por defecto se usa la entrega más reciente', async () => {
    const state = productionLike();
    state.prompt = loadBaseline(CANT_MAKE_IT_RELEASE.id).prompt;
    const { request } = fakeConduit(state);
    const out = await releaseConduit({
      env: env(),
      request: request as never,
      log: () => undefined,
    });
    expect(out.plan.map((p) => [p.name, p.state])).toEqual([
      ['prompt de conversación', 'pristine'],
    ]);
  });

  it('su foto anterior es el prompt de la entrega Sofía y el nuevo lo cambia', () => {
    expect(guidance.prompt).not.toBe(CONDUIT_BOT_PROMPT_TEMPLATE);
    expect(guidance.prompt).toContain(
      'NOT_APPLICABLE: no parece un comprobante; pídelo.',
    );
  });

  it('un prompt editado en el panel no se toca', async () => {
    const state = productionLike();
    state.prompt = 'Prompt propio del administrador';
    const { request, writes } = fakeConduit(state);
    const out = await releaseConduit({
      manifest: GUIDANCE_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(out.plan[0].state).toBe('customized');
    expect(writes).toEqual([]);
  });

  it('se puede elegir una entrega anterior por su nombre y una inexistente se rechaza', async () => {
    const { request } = fakeConduit();
    const out = await releaseConduit({
      env: env({ CONDUIT_RELEASE_ID: '2026-11-19-sofia' }),
      request: request as never,
      log: () => undefined,
    });
    expect(out.plan.length).toBeGreaterThan(1);
    await expect(
      releaseConduit({
        env: env({ CONDUIT_RELEASE_ID: 'no-existe' }),
        request: request as never,
        log: () => undefined,
      }),
    ).rejects.toThrow('No existe la entrega no-existe');
  });
});

describe('entrega de la foto del cabello y la valoración (prompt y mapeo)', () => {
  const previous = loadBaseline(HAIR_PHOTO_RELEASE.id);

  it('su foto anterior es el prompt de la entrega de orientación', () => {
    expect(previous.prompt).not.toBe(loadBaseline(GUIDANCE_RELEASE.id).prompt);
    expect(previous.prompt).toContain(
      'pasar_a_persona (motivo: orientación sobre su tratamiento)',
    );
    expect(previous.prompt).toContain(
      'pasar_a_persona (motivo: foto de su cabello).',
    );
    expect(previous.prompt).toContain('si tiene un anticipo pendiente');
    expect(previous.prompt).not.toBe(CONDUIT_BOT_PROMPT_TEMPLATE);
  });

  it('su foto anterior del mapeo es la de producción, sin la valoración', () => {
    expect(previous.mappingRules).not.toHaveProperty('assessment_offer');
    expect(BUSINESS_INFO_MAPPING_RULES.assessment_offer).toBe(
      'negocio.valoracion',
    );
  });

  it('con lo de producción actualiza solo el prompt y el mapeo', async () => {
    const state = productionLike();
    state.prompt = previous.prompt;
    state.mapping.rules = previous.mappingRules;
    const { request, writes } = fakeConduit(state);
    const out = await releaseConduit({
      manifest: HAIR_PHOTO_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(out.plan).toEqual([
      expect.objectContaining({ kind: 'prompt', state: 'pristine' }),
      expect.objectContaining({
        name: 'business.info.updated',
        state: 'pristine',
      }),
    ]);
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PUT bots/bot/prompts/CONVERSATION',
      'POST api/external-data/bot/mappings/business.info.updated',
    ]);
    expect(writes[0].body).toEqual({ content: CONDUIT_BOT_PROMPT_TEMPLATE });
    expect(writes[1].body).toMatchObject({
      rules: BUSINESS_INFO_MAPPING_RULES,
    });
  });

  it('un mapeo editado en el panel no se toca', async () => {
    const state = productionLike();
    state.prompt = previous.prompt;
    state.mapping.rules = { address: 'negocio.mi_direccion' };
    const { request, writes } = fakeConduit(state);
    await releaseConduit({
      manifest: HAIR_PHOTO_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(writes.some((w) => w.path.includes('/mappings/'))).toBe(false);
  });
});

describe('entrega del precio del equipo y los horarios especiales', () => {
  const previous = loadBaseline(TEAM_PRICE_RELEASE.id);

  it('su foto anterior es el prompt de la entrega de la foto del cabello y la valoración', () => {
    expect(previous.prompt).toContain(
      'solo si "Datos del negocio" trae valoracion',
    );
    expect(previous.prompt).not.toContain('guardar_precio_del_equipo');
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain('guardar_precio_del_equipo');
  });

  it('crea la herramienta activa, actualiza el prompt y agrega los horarios especiales al mapeo', async () => {
    const state = productionLike();
    state.prompt = previous.prompt;
    state.mapping.rules = previous.mappingRules;
    const { request, writes } = fakeConduit(state);
    await releaseConduit({
      manifest: TEAM_PRICE_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'POST bots/bot/tools',
      'PUT bots/bot/prompts/CONVERSATION',
      'POST api/external-data/bot/mappings/business.info.updated',
    ]);
    expect(writes[2].body).toMatchObject({
      rules: expect.objectContaining({
        special_hours: 'negocio.horarios_especiales',
      }) as unknown,
    });
    expect(writes[0].body).toMatchObject({
      name: 'guardar_precio_del_equipo',
      endpointUrl: 'https://spa/api/v1/conduit/team-quotes',
      isActive: true,
    });
  });
});

describe('entrega de seguimientos, fichas y horarios por hora', () => {
  const previous = loadBaseline(FOLLOW_UPS_RELEASE.id);

  function withPreviousTools() {
    const state = productionLike();
    state.prompt = previous.prompt;
    state.tools = FOLLOW_UPS_RELEASE.tools.map((name) => ({
      id: `t-${name}`,
      name,
      isActive: true,
      endpointUrl: `https://spa/api/v1/${name}`,
      ...previous.tools[name],
    })) as never;
    return state;
  }

  it('su foto anterior es la versión de las herramientas que hoy está en producción', () => {
    expect(Object.keys(previous.tools).sort()).toEqual(
      [...FOLLOW_UPS_RELEASE.tools].sort(),
    );
    expect(previous.tools.consultar_disponibilidad.description).not.toContain(
      'uno por hora',
    );
    expect(previous.prompt).not.toContain('missingBirthDate');
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain('missingBirthDate');
  });

  it('actualiza las herramientas, crea los dos mensajes nuevos y el prompt', async () => {
    const { request, writes } = fakeConduit(withPreviousTools());
    await releaseConduit({
      manifest: FOLLOW_UPS_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    const calls = writes.map((w) => `${w.method} ${w.path}`);
    for (const name of FOLLOW_UPS_RELEASE.tools) {
      expect(calls).toContain(`PATCH bots/bot/tools/t-${name}`);
    }
    expect(calls.filter((c) => c === 'POST templates')).toHaveLength(2);
    expect(calls).toContain('PUT bots/bot/prompts/CONVERSATION');
    expect(calls.some((c) => c.includes('/mappings/'))).toBe(false);
  });

  it('una herramienta editada en el panel no se pisa', async () => {
    const state = withPreviousTools();
    (state.tools as Array<{ description: string }>)[0].description =
      'Texto propio del administrador';
    const { request, writes } = fakeConduit(state);
    await releaseConduit({
      manifest: FOLLOW_UPS_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(
      writes.some((w) => w.path === 'bots/bot/tools/t-consultar_cliente'),
    ).toBe(false);
  });
});

describe('entrega de la clienta que no puede llegar (solo el prompt)', () => {
  const previous = loadBaseline(CANT_MAKE_IT_RELEASE.id);

  it('su foto anterior es el prompt de la entrega de seguimientos', () => {
    expect(previous.prompt).not.toContain('no podrá llegar');
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain('no podrá llegar');
    expect(previous.prompt).toContain('missingBirthDate');
  });

  it('solo actualiza el prompt si nadie lo editó en el panel', async () => {
    const state = productionLike();
    state.prompt = previous.prompt;
    const { request, writes } = fakeConduit(state);
    await releaseConduit({
      manifest: CANT_MAKE_IT_RELEASE,
      env: env({ CONDUIT_RELEASE_APPLY: 'true' }),
      request: request as never,
      log: () => undefined,
    });
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PUT bots/bot/prompts/CONVERSATION',
    ]);
  });
});
