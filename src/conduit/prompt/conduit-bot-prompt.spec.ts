import { CONDUIT_TOOL_CATALOG } from '../tools/conduit-tool-catalog';
import {
  CONDUIT_BOT_PROMPT_TEMPLATE,
  CONDUIT_BOT_SETTINGS,
} from './conduit-bot-prompt';
import { seedConduitPrompt } from '../../../prisma/seed-conduit-prompt';
import { SPECIALIST_DEFINITION } from '../../../prisma/seed-conduit-specialist';
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
  it('menciona cada una de las 16 herramientas del catálogo', () => {
    const missing = TOOL_NAMES.filter(
      (name) => !CONDUIT_BOT_PROMPT_TEMPLATE.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it('no nombra herramientas que no existen', () => {
    const mentioned =
      CONDUIT_BOT_PROMPT_TEMPLATE.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    const toolLike = mentioned.filter((word) =>
      /^(listar|consultar|disponibilidad|registrar|actualizar|crear|reservas|reagendar|cancelar|depositos|pasar|info|enlace)_/.test(
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

  it('Sofía se presenta, pide nombre y apellido y fecha, y registra a la clienta antes de reservar', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(CONDUIT_BOT_SETTINGS.agentName).toBe('Sofía');
    expect(t).toMatch(/Hola, soy \{\{agentName\}\} de \{\{companyName\}\}/);
    expect(t).toMatch(/nombre y apellido y su fecha de nacimiento/);
    expect(t).toMatch(/sin apellido o sin fecha no reserves/);
    expect(t.indexOf('registrar_cliente con name')).toBeGreaterThan(-1);
    expect(t.indexOf('registrar_cliente con name')).toBeLessThan(
      t.indexOf('crear_reserva_whatsapp una sola vez'),
    );
    expect(t).toMatch(/ficha queda creada/);
  });

  it('busca a la clienta primero, la saluda por su nombre y no repite datos si ya está registrada', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(/Lo primero.*consultar_cliente/);
    expect(t).toMatch(/con su primer nombre \("Hola, Diana, soy/);
    expect(t).toMatch(/registered true, ya los tenemos; no le pidas nombre/);
    expect(t).toMatch(/termsAccepted/);
  });

  it('explica los precios: rango con diagnóstico o precio personalizado', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(/priceIsRange.*rango.*después del diagnóstico en el spa/);
    expect(t).toMatch(/personalizedPrice.*perfil capilar/);
  });

  it('prohíbe mostrar datos técnicos y contempla errores de negocio y técnicos', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(/ids, códigos, JSON, nombres de herramientas/);
    expect(t).toMatch(/expected:true/);
    expect(t).toMatch(/OFFER_OTHER_SLOT/);
    expect(t).toMatch(/Nunca digas que una persona escribirá/);
    expect(t).toMatch(/Fallo técnico/);
    expect(t).toMatch(/Nunca inventes/);
  });

  it('no manda al bot a decir que el comprobante no llega por el chat', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).not.toMatch(
      /no le digas que puede enviarte/i,
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'registrar_comprobante_automatico',
    );
  });

  it('el saludo no pide datos y el flujo va servicio, datos, cupos', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(/No pidas datos ahí/);
    const servicio = t.indexOf('1. Servicio');
    const datos = t.indexOf('2. Datos');
    const cupos = t.indexOf('3. Cupos');
    expect(servicio).toBeGreaterThan(-1);
    expect(datos).toBeGreaterThan(servicio);
    expect(cupos).toBeGreaterThan(datos);
    expect(t).toMatch(/para brindarte una mejor atención/);
  });

  it('propone los cupos más cercanos sin pedir el día y da el anticipo en un solo mensaje', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(
      /sin pedirle el día, consulta disponibilidad_combo desde hoy/,
    );
    expect(t).toMatch(/los 2 o 3 cupos más cercanos/);
    expect(t).toMatch(/un solo mensaje ordenado/);
    expect(t).toMatch(/envíe aquí la foto del comprobante/);
  });

  it('manda el menú de servicios completo y con formato, y ofrece el enlace de la web', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toContain('Menú de servicios');
    expect(t).toMatch(/sin preguntar antes cuál quiere/);
    expect(t).toMatch(/enlace de la web/);
    expect(t).toMatch(/✨ \*Nombre\*/);
  });

  it('actúa según el veredicto del verificador de comprobantes', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(
      /\[imagen verificada por el sistema: VEREDICTO, CÓDIGOS\]/,
    );
    expect(t).toMatch(/INVALID: no llames registrar_comprobante_automatico/);
    expect(t).toMatch(
      /VALID, NEEDS_REVIEW, ERROR o sin esa línea: registrar_comprobante_automatico/,
    );
    expect(t).toMatch(/UNREADABLE/);
    expect(t).toMatch(/NOT_APPLICABLE/);
    expect(t).toMatch(/pasar_a_persona/);
  });

  it('los códigos de motivo del prompt son los que producen las reglas del especialista', () => {
    const codes = SPECIALIST_DEFINITION.rules.rules.map((rule) =>
      `${rule.field}_${rule.op}_FAILED`.toUpperCase(),
    );
    expect(codes).toEqual([
      'AMOUNT_GTE_FAILED',
      'DESTINATION_WITHIN_FAILED',
      'DATE_WITHIN_DAYS_FAILED',
    ]);
    for (const code of codes) {
      expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(code);
    }
  });

  it('un comprobante viejo es un resultado inválido', () => {
    const date = SPECIALIST_DEFINITION.rules.rules.find(
      (rule) => rule.field === 'date',
    );
    expect(date).toMatchObject({
      op: 'within_days',
      ref: { literal: 2 },
      onFail: 'INVALID',
    });
  });

  it('una cuenta equivocada es un resultado inválido, no uno dudoso', () => {
    const destination = SPECIALIST_DEFINITION.rules.rules.find(
      (rule) => rule.field === 'destination',
    );
    expect(destination?.onFail).toBe('INVALID');
  });

  it('los ajustes piden mensajes breves y emojis con expresividad', () => {
    expect(CONDUIT_BOT_SETTINGS.verbosity).toBe('SHORT');
    expect(CONDUIT_BOT_SETTINGS.emojiLevel).toBe('MEDIUM');
  });

  it('es corto: cabe en el bloque cacheable sin pesar en cada turno', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE.length).toBeLessThan(7300);
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
