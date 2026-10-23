import { CONDUIT_TOOL_CATALOG } from '../tools/conduit-tool-catalog';
import {
  CONDUIT_BOT_PROMPT_TEMPLATE,
  CONDUIT_BOT_SETTINGS,
} from './conduit-bot-prompt';
import { seedConduitPrompt } from '../../../prisma/seed-conduit-prompt';
import {
  BUSINESS_INFO_EVENT,
  BUSINESS_INFO_MAPPING_RULES,
} from '../../business-settings/business-info';

const TOOL_NAMES = CONDUIT_TOOL_CATALOG.map((t) => t.name);
const SUPPORTED_VARIABLES = [
  'agentName',
  'companyName',
  'language',
  'tone',
  'responseLength',
  'emojiInstruction',
  'formatInstruction',
];

describe('prompt del asistente de Leonice', () => {
  it('menciona cada una de las 13 herramientas del catálogo', () => {
    const missing = TOOL_NAMES.filter(
      (name) => !CONDUIT_BOT_PROMPT_TEMPLATE.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it('no nombra herramientas que no existen', () => {
    const mentioned =
      CONDUIT_BOT_PROMPT_TEMPLATE.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    const toolLike = mentioned.filter((word) =>
      /^(listar|consultar|disponibilidad|registrar|actualizar|crear|reservas|reagendar|cancelar|depositos|pasar|info)_/.test(
        word,
      ),
    );
    expect(toolLike.filter((word) => !TOOL_NAMES.includes(word))).toEqual([]);
  });

  it('usa solo variables de plantilla que Conduit resuelve', () => {
    const used = [
      ...CONDUIT_BOT_PROMPT_TEMPLATE.matchAll(/\{\{#?\/?(\w+)\}\}/g),
    ].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((v) => !SUPPORTED_VARIABLES.includes(v))).toEqual([]);
  });

  it('refleja las reglas del negocio', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(/no pidas|no lo pidas/i);
    expect(t).toContain('policyVersion "v1"');
    expect(t).toContain('TERMINOS_SERVICIO');
    expect(t).toContain('DATOS_SALUD');
    expect(t).toContain('MARKETING');
    expect(t).toContain('anticipos no se devuelven');
    expect(t).toContain('cancélala');
    expect(t).toContain('requiresAssessment');
    expect(t).toContain('purpose=RESCHEDULE');
    expect(t).toContain('Datos del negocio');
    expect(t).toMatch(/pesos colombianos/);
    expect(t).not.toMatch(
      /consultar_o_crear_cliente|crear_reserva\b|consultar_depositos/,
    );
  });

  it('no manda al bot a decir que el comprobante no llega por el chat', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).not.toMatch(
      /no le digas que puede enviarte/i,
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'registrar_comprobante_automatico',
    );
  });

  it('es corto: cabe en el bloque cacheable sin pesar en cada turno', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE.length).toBeLessThan(6000);
  });

  it('los ajustes dan margen al razonamiento y están dentro de los límites de Conduit', () => {
    expect(CONDUIT_BOT_SETTINGS.maxTokensConversation).toBeGreaterThanOrEqual(
      1024,
    );
    expect(CONDUIT_BOT_SETTINGS.maxTokensConversation).toBeLessThanOrEqual(
      1500,
    );
    expect(['AUTO', 'LOW', 'OFF']).toContain(
      CONDUIT_BOT_SETTINGS.reasoningMode,
    );
    expect(CONDUIT_BOT_SETTINGS.companyName.length).toBeLessThanOrEqual(120);
  });
});

describe('seedConduitPrompt', () => {
  type Call = { method: string; path: string; body: unknown };
  const BOT = '8e617ca9-5fd6-41ee-8cc5-6412cbe86235';
  const env = {
    CONDUIT_BASE_URL: 'http://conduit.test',
    CONDUIT_API_KEY: 'k',
    CONDUIT_DEFAULT_BOT_ID: BOT,
  } as NodeJS.ProcessEnv;

  function conduit(state: {
    content: string;
    isCustom: boolean;
    configured: boolean;
    mappings: Array<{ eventType: string; rules: Record<string, string> }>;
  }) {
    const calls: Call[] = [];
    global.fetch = jest.fn((url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname.replace('/api/v1/', '');
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        path,
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as unknown)
            : undefined,
      });
      const reply = (body: unknown) =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify(body)),
        } as Response);
      if (method === 'GET' && path.endsWith('/prompts/CONVERSATION'))
        return reply({ content: state.content, isCustom: state.isCustom });
      if (method === 'GET' && path.endsWith('/prompts/settings'))
        return reply({ configured: state.configured });
      if (method === 'GET' && path.endsWith('/mappings'))
        return reply(state.mappings);
      return reply({ ok: true });
    }) as never;
    return calls;
  }

  const writes = (calls: Call[]) =>
    calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
  });

  it('en un bot sin configurar guarda prompt, ajustes y hook', async () => {
    const calls = conduit({
      content: 'genérico',
      isCustom: false,
      configured: false,
      mappings: [],
    });
    await seedConduitPrompt(env);
    expect(writes(calls)).toEqual([
      `PUT bots/${BOT}/prompts/CONVERSATION`,
      `PUT bots/${BOT}/prompts/settings`,
      `POST api/external-data/${BOT}/mappings/${BUSINESS_INFO_EVENT}`,
    ]);
    expect(
      calls.find((c) => c.method === 'PUT' && c.path.endsWith('CONVERSATION'))!
        .body,
    ).toEqual({
      content: CONDUIT_BOT_PROMPT_TEMPLATE,
    });
    expect(
      calls.find((c) => c.path.endsWith('/settings') && c.method === 'PUT')!
        .body,
    ).toEqual({ ...CONDUIT_BOT_SETTINGS });
  });

  it('es idempotente: con todo ya sembrado no escribe nada', async () => {
    const calls = conduit({
      content: CONDUIT_BOT_PROMPT_TEMPLATE,
      isCustom: true,
      configured: true,
      mappings: [
        {
          eventType: BUSINESS_INFO_EVENT,
          rules: { ...BUSINESS_INFO_MAPPING_RULES },
        },
      ],
    });
    await seedConduitPrompt(env);
    expect(writes(calls)).toEqual([]);
  });

  it('no pisa un prompt, ajustes o hook editados desde el panel, y avisa', async () => {
    const calls = conduit({
      content: 'editado a mano',
      isCustom: true,
      configured: true,
      mappings: [
        { eventType: BUSINESS_INFO_EVENT, rules: { x: 'negocio.otro' } },
      ],
    });
    await seedConduitPrompt(env);
    expect(writes(calls)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('con CONDUIT_PROMPT_OVERWRITE=true reemplaza todo', async () => {
    const calls = conduit({
      content: 'editado a mano',
      isCustom: true,
      configured: true,
      mappings: [
        { eventType: BUSINESS_INFO_EVENT, rules: { x: 'negocio.otro' } },
      ],
    });
    await seedConduitPrompt({ ...env, CONDUIT_PROMPT_OVERWRITE: 'true' });
    expect(writes(calls)).toHaveLength(3);
  });

  it('sin configuración de Conduit se omite sin fallar', async () => {
    const calls = conduit({
      content: '',
      isCustom: false,
      configured: false,
      mappings: [],
    });
    await seedConduitPrompt({});
    expect(calls).toEqual([]);
  });
});
