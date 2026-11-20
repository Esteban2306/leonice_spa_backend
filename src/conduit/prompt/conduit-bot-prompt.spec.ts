import { CONDUIT_TOOL_CATALOG } from '../tools/conduit-tool-catalog';
import {
  CONDUIT_BOT_PROMPT_TEMPLATE,
  CONDUIT_BOT_SETTINGS,
} from './conduit-bot-prompt';
import { CONDUIT_INTENT_CATALOG } from '../intents/conduit-intent-catalog';
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
    expect(t).toMatch(/nunca menciones ids, códigos, JSON, herramientas/);
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
      /nunca le preguntes qué día quiere; consulta tú disponibilidad_combo desde hoy/,
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

  it('productos: informa y recomienda sin avisar al equipo; solo avisa cuando quiere comprar', () => {
    const section =
      CONDUIT_BOT_PROMPT_TEMPLATE.split('Productos\n')[1].split('\n\n')[0];
    expect(section).toContain('info_productos');
    expect(section).toContain('cuál va con su tratamiento');
    expect(section).toContain('Nunca prometas unidades');
    expect(section).toContain('Solo si dice que quiere comprarlo');
    expect(section).toContain('solicitar_compra_producto');
    expect(section).toContain('Una consulta o un precio no es una compra');
    expect(section).toContain('solo si la herramienta devolvió éxito');
    expect(section).toContain('No cobras ni tomas pagos');
  });

  it('si necesitan a Leo, se le avisa solo a ella con avisar_a_leo y nunca se da su número', () => {
    const start = CONDUIT_BOT_PROMPT_TEMPLATE.indexOf('Leo, la dueña');
    const end = CONDUIT_BOT_PROMPT_TEMPLATE.indexOf('Situaciones frecuentes');
    const section = CONDUIT_BOT_PROMPT_TEMPLATE.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(section).toContain('No tienes su número y nunca lo das');
    expect(section).toContain('avisar_a_leo');
    expect(section).toContain('si devolvió éxito');
    expect(section).toContain('No digas si está o no atendiendo');
    expect(section).not.toContain('Aviso obligatorio');
    expect(section).not.toMatch(/\+57|\d{7,}/);
  });

  it('la presentación sale solo a clientas nuevas (consultar_cliente la trae) y los datos se piden una vez', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain('y solo esta vez, su nombre');
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'Si consultar_cliente trae firstContactNotice, inclúyelo tal cual',
    );
  });

  it('recomienda con recomendar_para, ofrece cupos sin preguntar el día y no habla de cómo funciona por dentro', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'recomendar_para con lo que contó, y recomienda solo lo que devuelva',
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'nunca le preguntes qué día quiere',
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain('nunca menciones ids');
  });

  it('no agenda con "el primero que tengas" ni con un sí a varios horarios: pide día y hora exactos', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'no agendes: pídele que te diga el día y la hora exactos que quiere',
    );
    const booking = CONDUIT_INTENT_CATALOG.find((i) => i.key === 'booking')!;
    const slim = (booking.config as { slim: { prompt: string } }).slim.prompt;
    expect(slim).toContain(
      'no agendes: pídele que te diga el día y la hora exactos',
    );
    expect(slim).toContain('Un comprobante no confirma un horario');
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'Un comprobante o un "ya pagué" no confirma un horario',
    );
  });

  it('entiende los audios transcritos y pide escribir solo si no se pudo escuchar', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      '"[audio transcrito] …" es lo que dijo en un audio',
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'Solo "[audio]": no se pudo escuchar',
    );
  });

  it('a Leo se le avisa en el mismo turno, sin interrogar a la clienta, y un saludo cariñoso nunca se calla', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'avisar_a_leo en ese mismo turno, sin preguntarle de qué se trata',
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'Un saludo cariñoso ("hola mi reina", "mija", "nena", "linda") es de una clienta: respóndelo',
    );
  });

  it('recomienda solo con lo que dice el catálogo y pasa al equipo los temas internos', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain(
      'Nunca le atribuyas a algo beneficios que no traiga',
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toMatch(
      /Temas internos que no son una cita[^\n]*fotos o videos[^\n]*pasar_a_persona/,
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toContain('depositos_pendientes');
  });

  it('una compra pedida se avisa al equipo enseguida, sin pedir confirmación', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toMatch(
      /solicitar_compra_producto enseguida, sin pedir confirmación/,
    );
  });

  it('una queja va a una persona en el mismo turno y lo que no existe se reemplaza por opciones reales', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(
      /Ante una queja o un daño: pasar_a_persona en ese mismo turno, sin pedir datos/,
    );
    expect(t).toMatch(
      /no lo ofrecemos y en el mismo mensaje propón 2 o 3 opciones reales/,
    );
    expect(t).not.toMatch(/si insiste, ofrece pasar con una persona/);
  });

  it('con una clienta registrada nunca pide datos, ni al confirmar', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toMatch(/ni siquiera al confirmar/);
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toMatch(
      /"Datos vigentes", vuelve a llamar consultar_cliente antes de pedir datos/,
    );
    expect(CONDUIT_BOT_PROMPT_TEMPLATE).toMatch(
      /ficha queda creada y ya no le vuelves a pedir datos/,
    );
    const catalog = CONDUIT_INTENT_CATALOG.find((i) => i.key === 'booking');
    const slim = catalog?.config?.slim as {
      prompt: string;
      confirmHint: string;
    };
    expect(slim.confirmHint).toMatch(/llama primero consultar_cliente/);
    expect(slim.prompt).toMatch(/no vuelvas a pedirle datos/);
    expect(slim.confirmHint).toMatch(
      /registered true, llama crear_reserva_whatsapp directo/,
    );
    expect(slim.prompt).toMatch(/tampoco al confirmar/);
  });

  it('un fallo técnico del análisis de la imagen no se le pide reenviar a la clienta', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toMatch(/"no analizada"/);
    expect(t).toMatch(
      /Nunca digas que no pudiste revisarla ni le pidas reenviarla/,
    );
    expect(t).toMatch(/pide otra foto más clara, una sola vez/);
  });

  it('aprende de los chats reales: no anuncia revisiones, responde lo pedido y calla lo personal', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toContain('Nunca digas que vas a revisar');
    expect(t).toContain('Contesta solo lo que preguntó');
    expect(t).toContain(
      'responde solo [NO_RESPONDER]: sin saludo, sin presentarte y sin explicar que no respondes',
    );
    expect(t).toContain('Ante la duda, atiéndela');
    expect(t).toContain(
      'da en ese mensaje el precio y los 2 o 3 cupos más cercanos',
    );
    expect(t).toContain('Nunca des datos de otras clientas');
  });

  it('una foto del cabello va a una persona y nunca se toma por comprobante', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    const rule = t.indexOf('foto-cabello');
    expect(rule).toBeGreaterThan(0);
    expect(rule).toBeLessThan(
      t.indexOf('Otra imagen puede ser el comprobante'),
    );
    expect(t).toContain('no un comprobante: no registres pago');
    expect(t).toContain('pasar_a_persona (motivo: foto de su cabello)');
  });

  it('la orientación sobre su propio tratamiento va a una persona; una pregunta general de producto no', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).toContain(
      'pasar_a_persona (motivo: orientación sobre su tratamiento)',
    );
    expect(t).toContain('por texto, audio o foto');
    expect(t).toContain(
      'Una pregunta general de un producto (para qué sirve, precio) la respondes tú.',
    );
  });

  it('una foto que no es comprobante solo se toma como pago si hay un anticipo pendiente', () => {
    const t = CONDUIT_BOT_PROMPT_TEMPLATE;
    expect(t).not.toContain(
      'NOT_APPLICABLE: no parece un comprobante; pídelo.',
    );
    expect(t).toContain(
      'si tiene un anticipo pendiente (depositos_pendientes), pídeselo; si no, pregúntale en una frase en qué la ayudas con esa foto.',
    );
  });

  it('es corto: cabe en el bloque cacheable sin pesar en cada turno', () => {
    expect(CONDUIT_BOT_PROMPT_TEMPLATE.length).toBeLessThan(14100);
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
    variables?: string[];
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
      if (method === 'GET' && path.endsWith('/variables'))
        return reply(
          (state.variables ?? []).map((fullKey) => ({ fullKey, value: 'x' })),
        );
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

  it('con CONDUIT_MAPPING_OVERWRITE=true reemplaza solo el hook y respeta prompt y ajustes', async () => {
    const calls = conduit({
      content: 'editado a mano',
      isCustom: true,
      configured: true,
      mappings: [
        { eventType: BUSINESS_INFO_EVENT, rules: { x: 'negocio.otro' } },
      ],
    });
    await seedConduitPrompt({ ...env, CONDUIT_MAPPING_OVERWRITE: 'true' });
    expect(writes(calls)).toEqual([
      `POST api/external-data/${BOT}/mappings/${BUSINESS_INFO_EVENT}`,
    ]);
  });

  it('borra de Conduit el WhatsApp de Leo que quedó guardado de antes, y solo si está', async () => {
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
      variables: ['negocio.direccion', 'negocio.whatsapp_de_leo'],
    });
    await seedConduitPrompt(env);
    expect(writes(calls)).toEqual([
      `DELETE api/external-data/${BOT}/variables`,
    ]);
    const deleted = (global.fetch as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('keys='));
    expect(deleted).toContain('keys=negocio.whatsapp_de_leo');
    expect(deleted).not.toContain('direccion');
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
