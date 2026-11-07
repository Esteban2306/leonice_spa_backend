/**
 * Intenciones del spa que se siembran en Conduit (BotIntent). Conduit no
 * conoce al negocio: todo lo que sigue (frases, herramientas, plantillas,
 * programación) es dato de Leonice.
 *
 * Patrones: se evalúan sobre el texto normalizado (minúsculas, sin tildes ni
 * signos, letras repetidas colapsadas). Los textos de respuesta admiten
 * {{variables}} que entrega `render` más {{agente}} y {{negocio}}.
 */
export type IntentHandlerKind =
  'TEMPLATE' | 'TOOL_DIRECT' | 'HANDOFF' | 'LLM_SLIM';

export interface ConduitIntentSeed {
  key: string;
  name: string;
  description: string;
  handler: IntentHandlerKind;
  priority?: number;
  patterns: string[];
  denyPatterns?: string[];
  maxTokens?: number;
  respectsOpenFlow?: boolean;
  allowsQuestion?: boolean;
  negationOk?: boolean;
  fixedConfidence?: number;
  aiClassifiable?: boolean;
  config?: Record<string, unknown>;
  variants: Record<string, string[]>;
  cooldownSeconds?: number;
  schedule?: Record<string, unknown>;
  notes?: string;
  /** El seed nunca la activa aunque se pida ACTIVE (necesita revisión del negocio). */
  lockedMode?: 'SHADOW' | 'OFF';
}

const vocabulary = (words: string, anchors: string) =>
  `^(?=.*\\b(?:${anchors})\\b)(?:(?:${words})(?: |$))+$`;

const GREETING_WORDS =
  'hola|holi|hey|buenas|buenos dias|buen dia|buenas tardes|buenas noches|saludos|como estas|como esta|como estan|que tal|que mas|a todos|amiga|feliz dia|por favor';
const GREETING_ANCHORS =
  'hola|holi|hey|buenas|buenos dias|buen dia|saludos|que mas|que tal|como estas|como esta|como estan';
const COURTESY_WORDS =
  'muchas gracias|mil gracias|tantas gracias|gracias|chao|chau|adios|hasta luego|hasta pronto|nos vemos|bye|igualmente|por todo|por la ayuda|por la informacion|que tengas un buen dia|que tengas buen dia|que tengas un lindo dia|buen dia|feliz dia|feliz tarde|feliz noche|bendiciones|amiga|hermosa|de nada|ok|vale|listo|perfecto|super|genial|por favor';
const COURTESY_ANCHORS =
  'gracias|chao|chau|adios|hasta luego|hasta pronto|nos vemos|bye|bendiciones|de nada';

const TOPICS_DENY =
  'cancel\\w*|anul\\w*|reagend\\w*|reprogram\\w*|agendar|reservar|cambiar|mover|aplaz\\w*';
const NOT_TREATMENT =
  'cancel\\w*|anul\\w*|cita|citas|reserva|reservas|abono|anticipo|deposito|pago|pagar|horario|horarios|direccion|ubicacion|politica|domicilio|envio';
const ENTITY = '(?<entity>[a-z0-9 ]{3,40})';
const ART = '(?:el |la |un |una |los |las )?';

const LINK_VARS = {
  tratamiento: { path: 'treatment' },
  fecha: { path: 'scheduledStart', transform: 'datetime' },
  enlace: { path: 'url', transform: 'http_url' },
};

const cancelRender = {
  branches: [
    { when: { path: 'hasUpcoming', equals: false }, variant: 'none' },
    {
      when: {
        any: [
          { path: 'sameDayCount', gt: 1 },
          { path: 'upcomingDays', gt: 1 },
        ],
      },
      variant: 'linkMany',
      vars: LINK_VARS,
    },
    { variant: 'link', vars: LINK_VARS },
  ],
};

const TOOL_CACHE_PUBLIC = { scope: 'bot', seconds: 300 };
const TOOL_CACHE_CONTACT = { scope: 'contact', seconds: 120 };

export const BOOKING_SLIM_PROMPT = `Eres {{agentName}}, recepcionista de {{companyName}} (spa capilar), por WhatsApp. Ahora gestionas una cita: agendar, cambiar, cancelar o consultar disponibilidad.
Idioma: {{language}}. Tono: {{tone}}. Responde de forma {{responseLength}}. {{emojiInstruction}} {{formatInstruction}}

Reglas
- Natural y cálida; mensajes cortos, un tema y una sola pregunta por mensaje, máximo 3 opciones. Usa su nombre si lo sabes. Nunca muestres ids, códigos, JSON ni nombres de herramientas. Solo atiendes citas y servicios del spa; si la charla se sale de eso, una frase amable para volver al tema.
- Dinero en pesos colombianos tal como lo entregan las herramientas. Nunca inventes servicios, precios, horarios, disponibilidad ni el estado de una reserva.
- Usa la fecha y hora actuales del final de este mensaje para "hoy", "mañana", "el viernes" y fechas YYYY-MM-DD. Si el día no es claro, pregunta.
- El teléfono lo pone el sistema: no lo pidas.
- Si no sabes si está registrada, consultar_cliente primero. Si es el primer mensaje del bot en la conversación, preséntate ("Hola, {nombre}, soy {{agentName}} de {{companyName}}"); si ya te presentaste, no lo repitas.
- Precios: priceIsRange → da el rango y di que el precio final se confirma después del diagnóstico en el spa; personalizedPrice → es su precio; sin marcas es fijo.
- Servicios, duración, precio, promociones e id: listar_tratamientos. Nunca inventes un id: una herramienta que necesita un id se llama después de recibirlo.
- Solo al presentar varios tratamientos usa este formato con emojis (en otros mensajes, casi sin emojis): una frase de introducción, cada servicio como bloque separado por línea en blanco y una pregunta corta al final:
✨ *Nombre del servicio*
⏱ 60 min · 💰 $250.000
Rango (priceIsRange): 💰 con el rango y "(se confirma en la valoración)"; promoción: línea 🎁; requiere valoración: línea 📋. Un título en negrita por categoría si hay varias. Máximo 8 servicios por mensaje. Negrita con un solo asterisco.
- Horarios libres: consultar_disponibilidad (un servicio, un día) o disponibilidad_combo (varios servicios o días; purpose=RESCHEDULE al reagendar). Ofrece solo horarios que devuelvan; si no hay cupo, busca los días siguientes.
- Anticipo, medios de pago y políticas: info_negocio.

Reservar
1. Averigua el servicio y el día. Si trae requiresAssessment, avísale que primero se hace una valoración.
2. Consulta la disponibilidad y ofrece horarios reales.
3. Si consultar_cliente dio registered true, no pidas nombre, apellido ni fecha de nacimiento. Si dio registered false, pide en un solo mensaje su nombre y apellido y su fecha de nacimiento (obligatorios; sin ellos no reserves).
4. Confirma servicio, día, hora y precio (con la aclaración de rango si aplica). Si es nueva o termsAccepted es false, dile en esta misma pregunta que al confirmar acepta los términos del servicio. Espera un sí claro.
5. Con el sí ya está todo confirmado: no vuelvas a consultar (ni disponibilidad ni precio) ni a preguntar (ni términos). Si no está registrada, llama registrar_cliente con name completo, birthDate y consents [{type TERMINOS_SERVICIO, accepted true, policyVersion "v1"}]; si está registrada pero termsAccepted es false, solo con ese consent. Después, crear_reserva_whatsapp una sola vez, con treatmentNames (el nombre del servicio) si no tienes el id.
6. Cuéntale el estado y el resumen tal como los devuelve la herramienta, con el anticipo y cómo pagarlo. No digas que está confirmada si no lo está. Cierra con una despedida breve, sin preguntar nada más.
- Nunca preguntes por alergias ni embarazo por iniciativa propia. El permiso de salud (DATOS_SALUD) se pide solo si ella dice que SÍ tiene alergias o está embarazada: explica que es por su seguridad y, sin permiso, no lo guardes (con actualizar_perfil_cliente si ya está registrada). Si dice que no tiene nada, no lo menciones y no envíes isPregnant, allergies ni consent en client (mandarlos en falso hace fallar la reserva).

Cambiar o cancelar
- reservas_proximas muestra la cita. Si pide cancelar de forma explícita ("cancélala"), llama cancelar_reserva_whatsapp (scope SINGLE o DAY) en ese turno y dile que los anticipos no se devuelven. Para reagendar: disponibilidad_combo con purpose=RESCHEDULE, confirma la nueva hora y usa reagendar_reserva_whatsapp.

Fuera de esto
- Si pide hablar con una persona, tiene una queja, un tema de salud delicado o no logras resolver tras dos intentos, usa pasar_a_persona con el motivo y un resumen breve.
- Si quiere enviar un comprobante de pago, pídele que mande la foto por este chat. Cuando haya una imagen en la conversación, llama registrar_comprobante_automatico sin preguntar cuánto pagó; no confirmes ni registres montos, solo di que el equipo revisará el comprobante.
- Resultado con expected:true: explícalo en una frase simple y sigue su nextStep (OFFER_OTHER_SLOT: ofrece los horarios de alternatives o consulta otro día; SHOW_UPCOMING: revisa sus citas; ASK_CLIENT_DATA: pide el dato; OFFER_HANDOFF: ofrece pasar con una persona). No avises a nadie por esto. Fallo técnico: di que no pudiste completarlo; el sistema avisa al equipo solo. Nunca digas que una persona escribirá si pasar_a_persona no devolvió éxito.`;

export const TREATMENT_SLIM_PROMPT = `Eres {{agentName}}, recepcionista de {{companyName}} (spa capilar), por WhatsApp. La clienta pregunta por un tratamiento.
Idioma: {{language}}. Tono: {{tone}}. Responde de forma {{responseLength}}. {{emojiInstruction}} {{formatInstruction}}

Reglas
- Usa info_tratamiento con el nombre que dijo (o listar_tratamientos si no nombró uno) y responde SOLO con lo que devuelvan; nunca inventes beneficios, precios, duraciones ni resultados. Si el dato no está, dilo con naturalidad y ofrece pasarla con una persona del equipo.
- Precios: priceIsRange → da el rango y di que el precio final se confirma después del diagnóstico en el spa; personalizedPrice → es su precio; sin marcas es fijo. Dinero en pesos colombianos, tal como lo entregan las herramientas.
- Mensajes cortos y una sola pregunta. Nunca muestres ids ni nombres de herramientas.
- Si listas varios tratamientos usa este formato con emojis (en otros mensajes casi ninguno): una frase de introducción y cada servicio como bloque separado por línea en blanco, con una pregunta corta al final:
✨ *Nombre del servicio*
⏱ 60 min · 💰 $250.000
Rango: 💰 con el rango y "(se confirma en la valoración)"; promoción: línea 🎁; requiere valoración: línea 📋. Máximo 8 servicios; negrita con un solo asterisco.
- Si quiere agendar, dile que con gusto la ayudas y pregúntale el día que prefiere. Si pide una persona o tiene una queja, usa pasar_a_persona.`;

export const CONDUIT_INTENT_CATALOG: ConduitIntentSeed[] = [
  {
    key: 'treatment_question',
    name: 'Pregunta sobre un tratamiento (IA reducida)',
    description:
      'El cliente hace una pregunta abierta sobre un tratamiento: si sirve para su caso, comparaciones, recomendaciones, qué le conviene',
    handler: 'LLM_SLIM',
    priority: 300,
    patterns: [],
    aiClassifiable: true,
    config: {
      slim: {
        prompt: TREATMENT_SLIM_PROMPT,
        tools: [
          'consultar_cliente',
          'info_tratamiento',
          'listar_tratamientos',
          'pasar_a_persona',
        ],
        maxTokens: 700,
        flowTtlMinutes: 15,
      },
    },
    variants: {},
  },
  {
    key: 'booking',
    name: 'Agendar, cambiar o consultar disponibilidad (IA reducida)',
    description:
      'El cliente quiere agendar, reservar, cambiar o reagendar una cita, o pregunta por disponibilidad de horarios',
    handler: 'LLM_SLIM',
    priority: 200,
    patterns: [
      '\\b(?:agendar|agendame|agendarme|reservar|reservame|reservarme|separar|apartar)\\b',
      '\\b(?:quiero|necesito|quisiera|me gustaria|deseo) (?:(?:sacar|pedir|agendar|reservar) )?(?:una |un )?(?:cita|turno|reserva)\\b',
      '\\b(?:reagendar|reprogramar|reagendame|reprogramame)\\b',
      '\\b(?:disponibilidad|disponible|disponibles|cupo|cupos)\\b',
      '\\b(?:reagendar|reprogramar|cambiar|mover|aplazar|adelantar) (?:mi |la |una )?(?:cita|reserva|turno|hora)\\b',
      '\\b(?:cita|turno) (?:para|el|manana|hoy|este|esta)\\b',
    ],
    denyPatterns: [
      '\\b(?:persona|humano|humana|asesor|asesora|alguien del equipo|alguien del spa)\\b',
    ],
    maxTokens: 30,
    aiClassifiable: true,
    config: {
      slim: {
        prompt: BOOKING_SLIM_PROMPT,
        tools: [
          'consultar_cliente',
          'info_negocio',
          'listar_tratamientos',
          'consultar_disponibilidad',
          'disponibilidad_combo',
          'registrar_cliente',
          'actualizar_perfil_cliente',
          'crear_reserva_whatsapp',
          'reservas_proximas',
          'reagendar_reserva_whatsapp',
          'cancelar_reserva_whatsapp',
          'pasar_a_persona',
        ],
        flowTtlMinutes: 20,
        confirmHint:
          'La clienta acaba de confirmar con un sí la propuesta de tu último mensaje. Ahora ejecuta lo confirmado: si no está registrada llama registrar_cliente y luego crear_reserva_whatsapp (con treatmentNames si no tienes el id). No vuelvas a consultar servicios, precios ni disponibilidad y no pidas ninguna otra confirmación ni los términos otra vez. No uses pasar_a_persona: la reserva la haces tú ahora.',
        endsOnTools: [
          'crear_reserva_whatsapp',
          'reagendar_reserva_whatsapp',
          'cancelar_reserva_whatsapp',
        ],
      },
    },
    variants: {},
  },
  {
    key: 'greeting',
    name: 'Saludo',
    description: 'Saludo simple, sin ninguna petición',
    handler: 'TOOL_DIRECT',
    priority: 10,
    patterns: [vocabulary(GREETING_WORDS, GREETING_ANCHORS)],
    maxTokens: 6,
    respectsOpenFlow: true,
    cooldownSeconds: 60,
    config: {
      greetingSource: true,
      tool: 'consultar_cliente',
      identityOptional: true,
      cache: { scope: 'contact', seconds: 60 },
      render: {
        branches: [
          {
            when: {
              all: [
                { path: 'registered', equals: true },
                { path: 'firstName', empty: false },
              ],
            },
            variant: 'registered',
            vars: { nombre: { path: 'firstName', transform: 'capitalize' } },
          },
          { variant: 'default' },
        ],
      },
    },
    variants: {
      prefix_registered: [
        '¡Hola {{nombre}}! Soy {{agente}} de {{negocio}} 😊',
        '¡Hola {{nombre}}! 🌿 Soy {{agente}} de {{negocio}}.',
      ],
      prefix_default: [
        '¡Hola! Soy {{agente}} de {{negocio}} 😊',
        '¡Hola! 🌿 Soy {{agente}} de {{negocio}}.',
      ],
      registered: [
        '¡Hola {{nombre}}! 😊 Soy {{agente}} de {{negocio}}. ¿En qué te puedo ayudar hoy?',
        '¡Hola {{nombre}}! 🌿 Soy {{agente}} de {{negocio}}. Cuéntame, ¿qué necesitas?',
        '¡Qué gusto saludarte, {{nombre}}! Soy {{agente}} de {{negocio}}. ¿En qué te ayudo?',
      ],
      default: [
        '¡Hola! 😊 Soy {{agente}} de {{negocio}}. ¿En qué te puedo ayudar hoy?',
        '¡Hola! 🌿 Soy {{agente}} de {{negocio}}. Cuéntame, ¿qué necesitas?',
        '¡Qué gusto saludarte! Soy {{agente}} de {{negocio}}. ¿En qué te ayudo?',
      ],
    },
  },
  {
    key: 'courtesy',
    name: 'Gracias y despedida',
    description: 'Agradecimiento o despedida, sin ninguna petición',
    handler: 'TEMPLATE',
    priority: 10,
    patterns: [vocabulary(COURTESY_WORDS, COURTESY_ANCHORS)],
    maxTokens: 8,
    respectsOpenFlow: true,
    allowsQuestion: false,
    cooldownSeconds: 60,
    config: { silentAfterTask: true },
    variants: {
      default: [
        '¡Con gusto! 🌿 Si necesitas algo más, aquí estoy.',
        '¡Para eso estoy! 😊 Cuando quieras, me escribes.',
        '¡Un gusto ayudarte! 🌿 Que tengas un lindo día.',
      ],
    },
  },
  {
    key: 'cancel_booking',
    name: 'Cancelar cita (enlace)',
    description: 'Pide cancelar su cita de forma explícita',
    handler: 'TOOL_DIRECT',
    priority: 20,
    patterns: [
      '^(?:(?:hola|buenas|buenos dias|buenas tardes|buenas noches) )?(?:quiero |necesito |quisiera |deseo )?(?:cancelar|anular) (?:mi |la |una |esa |mis )?(?:cita|citas|reserva|reservas|turno|sesion)(?: por favor)?(?: (?:de )?(?:hoy|manana|este \\w+|el \\w+))?$',
      '^(?:cancela|cancelame|anula|anulame) (?:mi |la |esa |mis )?(?:cita|citas|reserva|reservas|turno|sesion)(?: por favor)?$',
      '^(?:quiero|necesito|quisiera) cancelar(?: por favor)?$',
    ],
    denyPatterns: [
      '\\b(?:puedo|podria|se puede|es posible|politica|penalidad|multa|cobran|cobro|devuelven|devolucion|reembolso|anticipo|abono|deposito|cuanto|cuesta|como|ayer|cancele|cancelo|cancelaron|cancelaste|y|pero)\\b',
      '\\b(?:reagend\\w*|reprogram\\w*|agendar|cambiar|mover|aplaz\\w*|otra)\\b',
    ],
    maxTokens: 14,
    allowsQuestion: false,
    config: {
      greetFirstContact: true,
      tool: 'enlace_cancelacion',
      render: cancelRender,
    },
    variants: {
      link: [
        'Claro 🌿 Aquí tienes el enlace seguro para cancelar tu cita de *{{tratamiento}}* del {{fecha}}:\n\n{{enlace}}\n\nSi prefieres reagendar, dime la nueva fecha y te ayudo por aquí.',
        'Listo 🙌 Con este enlace puedes cancelar tu cita de *{{tratamiento}}* del {{fecha}}:\n\n{{enlace}}\n\nY si mejor quieres cambiarla de fecha, escríbeme el día y lo vemos.',
      ],
      linkMany: [
        'Claro 🌿 Aquí tienes el enlace para gestionar tus citas del {{fecha}} (empezando por *{{tratamiento}}*):\n\n{{enlace}}\n\nSi quieres cancelar otra de tus citas, dime cuál.',
      ],
      none: [
        'No encuentro citas próximas con este número 🤔 Si quieres agendar, dime qué tratamiento te interesa y la fecha que prefieres.',
      ],
    },
  },
  {
    key: 'cannot_attend',
    name: 'No puede asistir (enlace o reagendar)',
    description: 'Avisa que no podrá asistir a su cita',
    handler: 'TOOL_DIRECT',
    priority: 20,
    patterns: [
      '^(?:ya )?no (?:voy a )?(?:puedo|podre|podria) (?:ir|asistir|llegar|ir hoy|asistir hoy)(?: (?:hoy|manana))?$',
      '^no voy a poder (?:ir|asistir|llegar)(?: (?:hoy|manana))?$',
      '^(?:me )?surgio algo(?: y)? no (?:voy a )?(?:puedo|podre) (?:ir|asistir|llegar)$',
    ],
    denyPatterns: ['\\b(?:y|pero|reagend\\w*|otra|cuando)\\b'],
    maxTokens: 14,
    allowsQuestion: false,
    negationOk: true,
    config: {
      greetFirstContact: true,
      tool: 'enlace_cancelacion',
      render: cancelRender,
    },
    variants: {
      link: [
        'Gracias por avisarme 🌿 Tienes dos opciones para tu cita de *{{tratamiento}}* del {{fecha}}:\n\n1) Cancelarla con este enlace:\n{{enlace}}\n\n2) Reagendarla: dime la fecha que prefieres y la cambio por ti.',
      ],
      linkMany: [
        'Gracias por avisarme 🌿 Tienes dos opciones para tus citas del {{fecha}} (empezando por *{{tratamiento}}*):\n\n1) Cancelarlas con este enlace:\n{{enlace}}\n\n2) Reagendarlas: dime la fecha que prefieres.',
      ],
      none: [
        'Gracias por avisarme 🌿 No encuentro citas próximas con este número. Si necesitas agendar, dime el tratamiento y la fecha que prefieres.',
      ],
    },
  },
  {
    key: 'business_hours',
    name: 'Horario de atención',
    description: 'Pregunta por el horario o a qué hora abren o cierran',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:cual es |cuales son |me dices |me das |me regalas )?(?:el |los )?(?:horario|horarios)(?: de atencion| de servicio| de apertura)?(?: por favor)?$',
      '^(?:a que hora|hasta que hora|desde que hora) (?:abren|cierran|atienden|abre|cierra|atiende)(?: hoy| manana| (?:los |el )?(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|festivos?))?(?: por favor)?$',
      '^(?:abren|atienden|trabajan) (?:los |el )?(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|festivos?)(?: por favor)?$',
      '^que horarios? (?:manejan|tienen|atienden)$',
    ],
    denyPatterns: [
      `\\b(?:${TOPICS_DENY}|y|pero|disponibilidad|cupo|espacio|libre)\\b`,
    ],
    maxTokens: 10,
    config: {
      greetFirstContact: true,
      tool: 'info_negocio',
      cache: TOOL_CACHE_PUBLIC,
      render: {
        branches: [
          {
            variant: 'default',
            vars: {
              horario: {
                list: {
                  path: 'weeklySchedule',
                  item: '• {day|capitalize}: {hours}',
                },
              },
            },
          },
        ],
      },
    },
    variants: {
      default: [
        'Nuestro horario de atención 🕘\n\n{{horario}}\n\n¿Quieres que te ayude a agendar una cita?',
      ],
    },
  },
  {
    key: 'business_location',
    name: 'Dirección',
    description: 'Pregunta dónde queda el spa o cómo llegar',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:cual es |me dices |me das |me regalas |me compartes |me pasas |me envias |me puedes pasar |me puedes dar |me podrias dar )?(?:la |su )?(?:direccion|ubicacion)(?: del spa| del local| exacta)?(?: por favor)?$',
      '^donde (?:queda|quedan|estan|esta|se ubican|se encuentran|los encuentro)(?: el spa| el local| ustedes| ubicados| ubicadas)?(?: por favor)?$',
      '^como (?:llego|puedo llegar)(?: al spa| al local)?$',
    ],
    denyPatterns: [`\\b(?:${TOPICS_DENY}|y|pero)\\b`],
    maxTokens: 10,
    config: {
      greetFirstContact: true,
      tool: 'info_negocio',
      cache: TOOL_CACHE_PUBLIC,
      render: {
        branches: [
          { variant: 'default', vars: { direccion: { path: 'address' } } },
        ],
      },
    },
    variants: {
      default: [
        'Nos encuentras en 📍\n\n{{direccion}}\n\n¿Te ayudo a agendar tu cita?',
      ],
    },
  },
  {
    key: 'cancellation_policy',
    name: 'Política de cancelación',
    description: 'Pregunta cómo funciona la cancelación o qué pasa si cancela',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:cual es |me dices |me explicas )?(?:la |su )?politicas? de cancelacion(?: por favor)?$',
      '^como funciona (?:la )?cancelacion(?: de (?:una |la )?cita)?$',
      '^(?:que pasa|que sucede) si cancelo(?: mi cita| una cita)?$',
    ],
    denyPatterns: ['\\b(?:y|pero|quiero|necesito)\\b'],
    maxTokens: 12,
    config: {
      greetFirstContact: true,
      tool: 'info_negocio',
      cache: TOOL_CACHE_PUBLIC,
      render: {
        branches: [
          {
            variant: 'default',
            vars: { politica: { path: 'cancellationPolicy' } },
          },
        ],
      },
    },
    variants: { default: ['Sobre cancelaciones 🌿\n\n{{politica}}'] },
  },
  {
    key: 'deposit_info',
    name: 'Anticipo (valor y cómo pagarlo)',
    description: 'Pregunta cuánto es el anticipo o cómo se paga',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:de )?cuanto es (?:el )?(?:anticipo|abono|deposito)(?: para reservar| para agendar)?$',
      '^(?:cual es |me dices |me explicas )?(?:el |la )?(?:valor del |monto del )?(?:anticipo|abono|deposito)(?: para reservar| para agendar)?$',
      '^como (?:pago|hago|se paga) (?:el )?(?:anticipo|abono|deposito)$',
      '^hay que (?:dar|pagar) (?:un )?(?:anticipo|abono|deposito)(?: para reservar)?$',
    ],
    denyPatterns: ['\\b(?:y|pero|pague|pagado|ya|estado|llego|confirm\\w*)\\b'],
    maxTokens: 12,
    config: {
      greetFirstContact: true,
      tool: 'info_negocio',
      cache: TOOL_CACHE_PUBLIC,
      render: {
        branches: [
          {
            when: { path: 'depositAmountCop', gt: 0 },
            variant: 'withAmount',
            vars: {
              valor: { path: 'depositAmountCop', transform: 'money_cop' },
              instrucciones: { path: 'depositInstructions', optional: true },
              politica: { path: 'depositPolicy', optional: true },
              plazo: { path: 'depositDeadline', optional: true },
            },
          },
          {
            when: { path: 'depositInstructions', empty: false },
            variant: 'noAmount',
            vars: {
              instrucciones: { path: 'depositInstructions' },
              politica: { path: 'depositPolicy', optional: true },
              plazo: { path: 'depositDeadline', optional: true },
            },
          },
        ],
      },
    },
    variants: {
      withAmount: [
        'Sobre el anticipo 🌿\n\nValor: {{valor}}\n{{instrucciones}}\n{{politica}}\n{{plazo}}',
      ],
      noAmount: [
        'Sobre el anticipo 🌿\n\n{{instrucciones}}\n{{politica}}\n{{plazo}}',
      ],
    },
  },
  {
    key: 'payment_methods',
    name: 'Medios de pago',
    description: 'Pregunta por los medios o formas de pago',
    handler: 'TEMPLATE',
    priority: 30,
    patterns: [
      '^(?:cuales son |me dices |me informas )?(?:los |las |sus |nuestras )?(?:medios|metodos|formas) de pago(?: disponibles| que manejan| que tienen| que aceptan)?$',
      '^como (?:puedo |se )?(?:pago|pagar)(?: la cita| el servicio| el tratamiento)?$',
      '^(?:aceptan|reciben|manejan) (?:tarjeta|tarjetas|efectivo|nequi|daviplata|transferencia|transferencias|pse|datafono)(?: de credito| debito)?$',
    ],
    denyPatterns: ['\\b(?:anticipo|abono|deposito|y|pero)\\b'],
    maxTokens: 12,
    cooldownSeconds: 0,
    lockedMode: 'SHADOW',
    notes:
      'PENDIENTE DE CAMBIO: texto genérico. Reemplazar por los medios de pago reales del spa (y, cuando exista el dato en el panel de negocio, leerlo con una herramienta) y recién entonces activar la intención con PATCH /bots/:botId/intents/payment_methods/mode.',
    variants: {
      default: [
        'Los medios de pago te los confirmamos al agendar tu cita 🌿 Si ya tienes una cita, pregúntanos por aquí y una persona del equipo te ayuda.',
      ],
    },
    config: { greetFirstContact: true },
  },
  {
    key: 'my_bookings',
    name: 'Mis citas',
    description: 'Quiere ver o recordar sus citas próximas',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:cuales son |me dices |me muestras |me recuerdas |quiero ver |puedes ver )?(?:mis |mi )(?:citas|cita|reservas|reserva)(?: agendadas| programadas| proximas)?(?: por favor)?$',
      '^(?:que|cuales) (?:citas|reservas) tengo(?: agendadas| programadas)?$',
      '^(?:cuando|a que hora) es mi (?:cita|reserva|proxima cita)$',
      '^tengo (?:alguna )?(?:cita|reserva)(?: agendada| programada)?$',
      '^cuando tengo (?:mi )?(?:cita|reserva)$',
      '^para cuando (?:tengo|es) mi (?:cita|reserva)$',
    ],
    denyPatterns: [`\\b(?:${TOPICS_DENY}|y|pero)\\b`],
    maxTokens: 10,
    config: {
      greetFirstContact: true,
      tool: 'reservas_proximas',
      render: {
        branches: [
          {
            when: {
              all: [
                { path: 'days', exists: true },
                { path: 'days', empty: true },
              ],
            },
            variant: 'none',
          },
          {
            variant: 'some',
            vars: {
              citas: {
                list: {
                  path: 'days[*].reservations[*]',
                  item: '• {treatment} — {scheduledStart|datetime}',
                },
              },
            },
          },
        ],
      },
    },
    variants: {
      some: [
        'Estas son tus próximas citas 🌿\n\n{{citas}}\n\n¿Necesitas cambiar o cancelar alguna?',
      ],
      none: [
        'No encuentro citas próximas con este número 🤔 Si quieres agendar, dime qué tratamiento te interesa y la fecha que prefieres.',
      ],
    },
  },
  {
    key: 'deposit_status',
    name: 'Estado del abono',
    description: 'Pregunta por el estado de su abono o anticipo',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:cual es |me dices )?(?:el )?estado (?:de |del )(?:mi |el )?(?:abono|anticipo|deposito|pago)$',
      '^(?:ya )?(?:me )?(?:llego|confirmaron|registraron|recibieron|reflejo) (?:mi |el )?(?:abono|anticipo|deposito|pago)$',
      '^(?:tengo|hay) (?:algun |un )?(?:abono|anticipo|deposito) pendiente$',
      '^cuanto (?:debo|me falta|falta) (?:de |del )?(?:abono|anticipo|deposito)$',
    ],
    denyPatterns: [`\\b(?:${TOPICS_DENY}|y|pero)\\b`],
    maxTokens: 12,
    config: {
      greetFirstContact: true,
      tool: 'depositos_pendientes',
      render: {
        branches: [
          {
            when: {
              all: [
                { path: 'candidates', exists: true },
                { path: 'candidates', empty: true },
              ],
            },
            variant: 'none',
          },
          {
            variant: 'some',
            vars: {
              pendientes: {
                list: {
                  path: 'candidates',
                  item: '• {treatmentName} — {scheduledStart|datetime}',
                },
              },
            },
          },
        ],
      },
    },
    variants: {
      some: [
        'Tienes pendiente el abono de:\n\n{{pendientes}}\n\nPara confirmarla, envíame por aquí la foto del comprobante de pago 📸',
      ],
      none: [
        'No tienes abonos pendientes en este momento 🌿 ¿Te ayudo con algo más?',
      ],
    },
  },
  {
    key: 'treatments_list',
    name: 'Lista de tratamientos y precios',
    description: 'Pide la lista general de tratamientos o precios',
    handler: 'TOOL_DIRECT',
    priority: 30,
    patterns: [
      '^(?:que|cuales) precios (?:manejan|tienen)$',
      '^(?:que |cuales )?(?:tratamientos|servicios|procedimientos) (?:tienen|ofrecen|manejan|hay|son)(?: disponibles)?$',
      '^(?:cuales son )?(?:sus |los |nuestros )?(?:tratamientos|servicios)(?: que tienen| disponibles)?$',
      '^(?:me das |me pasas |me envias |me compartes |quiero ver |quisiera ver )?(?:la |el )?(?:lista|listado|catalogo) de (?:precios|tratamientos|servicios)(?: por favor)?$',
      '^(?:me das |me dices |me pasas )?(?:los |sus )?precios(?: por favor)?$',
      '^que (?:tratamientos|servicios) (?:tienen|ofrecen|manejan) y (?:sus |los )?precios$',
    ],
    denyPatterns: [
      `\\b(?:${TOPICS_DENY}|pero|facial|capilar|masaje|keratina|alisado|botox)\\b`,
    ],
    maxTokens: 12,
    config: {
      greetFirstContact: true,
      tool: 'listar_tratamientos',
      cache: TOOL_CACHE_CONTACT,
      render: {
        branches: [
          {
            when: { path: '[*].priceIsRange', includes: true },
            variant: 'withRange',
            vars: { lista: { list: treatmentsList() } },
          },
          { variant: 'default', vars: { lista: { list: treatmentsList() } } },
        ],
      },
    },
    variants: {
      default: [
        'Estos son nuestros tratamientos 🌿\n\n{{lista}}\n\n¿Te cuento más de alguno o te ayudo a agendar?',
      ],
      withRange: [
        'Estos son nuestros tratamientos 🌿\n\n{{lista}}\n\nLos precios con rango se confirman en la valoración en el spa.\n\n¿Te cuento más de alguno o te ayudo a agendar?',
      ],
    },
  },
  {
    key: 'treatment_info',
    name: 'Ficha de un tratamiento',
    description:
      'Pregunta precio, duración o qué incluye un tratamiento puntual',
    handler: 'TOOL_DIRECT',
    priority: 40,
    patterns: [
      `^cuanto (?:cuesta|vale|cobran por|sale|es) ${ART}${ENTITY}$`,
      `^cual es el (?:precio|valor) (?:de |del |de la |de los |de las )?${ENTITY}$`,
      `^(?:precio|valor|costo) (?:de |del |de la |de los |de las )?${ENTITY}$`,
      `^que (?:incluye|trae|es|hace|beneficios tiene|beneficios trae) ${ART}${ENTITY}$`,
      `^cuanto (?:dura|demora|tarda) ${ART}${ENTITY}$`,
      `^de que (?:se trata|trata) ${ART}${ENTITY}$`,
      `^me (?:cuentas|explicas|puedes contar|puedes explicar|das informacion) (?:sobre|de|del|de la|acerca de) ${ART}${ENTITY}$`,
      `^informacion (?:sobre|de|del|de la|acerca de) ${ART}${ENTITY}$`,
      `^para que sirve ${ART}${ENTITY}$`,
      `^en que consiste ${ART}${ENTITY}$`,
    ],
    denyPatterns: [`\\b(?:${NOT_TREATMENT}|y|pero|todos|todo)\\b`],
    maxTokens: 12,
    config: {
      greetFirstContact: true,
      tool: 'info_tratamiento',
      params: { query: '$entity' },
      cache: TOOL_CACHE_CONTACT,
      fallbackTo: 'treatment_question',
      render: {
        branches: [
          {
            when: { path: 'status', equals: 'found' },
            variant: 'found',
            vars: {
              titulo: { path: 'card.title' },
              resumen: { path: 'card.summary', optional: true },
              datos: {
                list: { path: 'card.facts', item: '{.}' },
                optional: true,
              },
              beneficios: {
                list: { path: 'card.benefits', item: '{.}' },
                optional: true,
              },
              notas: {
                list: { path: 'card.notes', item: '{.}' },
                optional: true,
              },
            },
          },
          {
            when: { path: 'status', equals: 'ambiguous' },
            variant: 'ambiguous',
            vars: {
              opciones: { list: { path: 'optionNames', item: '{.}' } },
            },
          },
        ],
      },
    },
    variants: {
      found: [
        '{{titulo}}\n{{resumen}}\n\n{{datos}}\n\n{{beneficios}}\n\n{{notas}}\n\n¿Quieres que te ayude a agendarlo? 🌿',
      ],
      ambiguous: [
        'Tenemos varias opciones con ese nombre 🌿\n\n{{opciones}}\n\n¿Cuál te interesa?',
      ],
    },
  },
  {
    key: 'human_request',
    name: 'Pide hablar con una persona',
    description: 'Pide hablar con una persona del equipo',
    handler: 'HANDOFF',
    priority: 5,
    patterns: [
      '^(?:quiero |necesito |quisiera |puedo |me gustaria |deseo )?(?:hablar|comunicarme|contactarme|escribirle|escribir|comunicar|pasarme|que me pasen|que me comuniquen) (?:con )?(?:una |un |alguna |algun )?(?:persona|humano|humana|asesor|asesora|alguien|agente|encargado|encargada|administrador|administradora|recepcion)(?: real| del spa| de verdad)?(?: por favor)?$',
      '^(?:quiero |necesito |prefiero )?(?:que )?(?:me )?(?:atienda|atiende|responda) (?:una |un )?(?:persona|humano|humana|asesor|asesora)(?: por favor)?$',
      '^(?:no quiero|no deseo|prefiero no) hablar con (?:un )?(?:bot|robot|asistente|maquina)$',
      '^(?:una |un )?(?:persona|humano|asesor|asesora|agente)(?: por favor)?$',
    ],
    denyPatterns: [`\\b(?:${TOPICS_DENY}|y|pero)\\b`],
    maxTokens: 12,
    negationOk: true,
    config: {
      tool: 'pasar_a_persona',
      reason: 'La clienta pidió hablar con una persona',
      notifyTeam: false,
    },
    variants: {
      default: [
        'Listo 🙌 Ya avisé al equipo. Una persona te escribirá por este mismo chat lo antes posible.',
        'Claro, ya le pasé tu mensaje al equipo 🌿 Una persona continuará la conversación por aquí en breve.',
      ],
    },
  },
  {
    key: 'complaint',
    name: 'Queja',
    description: 'Expresa una queja o inconformidad',
    handler: 'HANDOFF',
    priority: 5,
    patterns: [
      '\\b(?:queja|reclamo|mal servicio|pesimo servicio|pesima atencion|mala atencion|inconforme|estoy molesta|estoy muy molesta|estoy molesto|estoy muy molesto|estoy indignada|estoy indignado)\\b',
    ],
    denyPatterns: [
      '\\b(?:ninguna|ningun|sin|gracias|felicitar|felicitaciones|excelente|buen servicio|buena atencion)\\b',
    ],
    maxTokens: 30,
    fixedConfidence: 0.9,
    config: {
      tool: 'pasar_a_persona',
      reason: 'La clienta expresa una queja o inconformidad',
      notifyTeam: false,
    },
    variants: {
      default: [
        'Lamento mucho lo que pasó 🙏 Ya avisé al equipo para que una persona te escriba por este chat y lo revise contigo cuanto antes.',
      ],
    },
  },
  {
    key: 'rule.opt_out',
    name: 'Regla: no quiere más mensajes',
    description:
      'Texto de confirmación cuando la clienta pide no recibir más mensajes',
    handler: 'TEMPLATE',
    priority: 0,
    patterns: [],
    variants: {
      default: [
        'Listo, no te volveremos a escribir por este chat 🌿 Si más adelante quieres agendar o retomar la conversación, escríbenos "volver" y con gusto te atendemos.',
      ],
    },
  },
  {
    key: 'rule.opt_in',
    name: 'Regla: vuelve a querer mensajes',
    description: 'Texto cuando la clienta que había pedido silencio vuelve',
    handler: 'TEMPLATE',
    priority: 0,
    patterns: [],
    variants: {
      default: [
        '¡Qué gusto tenerte de vuelta! 😊 Cuéntame, ¿en qué te puedo ayudar?',
      ],
    },
  },
  {
    key: 'rule.spam',
    name: 'Regla: spam',
    description:
      'Spam (enlaces de promoción, ráfagas, mensajes repetidos): el bot calla 60 min en ese chat y avisa al equipo; no tiene texto de respuesta',
    handler: 'TEMPLATE',
    priority: 0,
    patterns: [],
    variants: {},
  },
  {
    key: 'rule.handoff',
    name: 'Regla: traspaso hecho por el sistema',
    description:
      'Texto fijo cuando el sistema pasa el chat a una persona (fallo técnico o paso siguiente "traspaso") y el aviso al equipo quedó verificado',
    handler: 'TEMPLATE',
    priority: 0,
    patterns: [],
    variants: {
      default: [
        'Ya avisé al equipo y una persona te escribirá por este mismo chat lo antes posible 🙏',
        'Tuvimos un inconveniente de nuestro lado. Ya le avisé al equipo y una persona te escribirá por aquí en breve 🙏',
      ],
    },
  },
  {
    key: 'rule.handoff_failed',
    name: 'Regla: traspaso sin nadie a quien avisar',
    description:
      'Texto fijo cuando no se pudo avisar a nadie del equipo: no promete que una persona escribirá',
    handler: 'TEMPLATE',
    priority: 0,
    patterns: [],
    variants: {
      default: [
        'En este momento no pude completar tu solicitud. Por favor escríbenos de nuevo en unos minutos 🙏',
      ],
    },
  },
  {
    key: 'rule.abuse',
    name: 'Regla: mensaje ofensivo',
    description: 'Texto fijo ante un insulto; el equipo es avisado',
    handler: 'TEMPLATE',
    priority: 0,
    patterns: [],
    variants: {
      default: [
        'Lamento que hayas tenido una mala experiencia 🙏 Prefiero que una persona del equipo te atienda directamente: ya le pasé tu mensaje y te escribirá por este chat.',
      ],
    },
  },
];

function treatmentsList() {
  return {
    path: '[*]',
    item: [
      {
        when: {
          all: [
            { path: 'promotion.price', exists: true },
            { path: 'duration', exists: true },
          ],
        },
        text: '✨ *{name}*\n⏱ {duration} · 💰 {price}\n🎁 Promo {promotion.discount}: {promotion.price}',
      },
      {
        when: { path: 'promotion.price', exists: true },
        text: '✨ *{name}*\n💰 {price}\n🎁 Promo {promotion.discount}: {promotion.price}',
      },
      {
        when: {
          all: [
            { path: 'price', exists: true },
            { path: 'duration', exists: true },
          ],
        },
        text: '✨ *{name}*\n⏱ {duration} · 💰 {price}',
      },
      {
        when: { path: 'price', exists: true },
        text: '✨ *{name}*\n💰 {price}',
      },
      { text: '✨ *{name}*' },
    ],
    separator: '\n\n',
    groupBy: 'category',
    groupHeader: '🌿 *{}*',
    limit: 25,
  };
}
