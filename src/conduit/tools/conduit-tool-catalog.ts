type JsonSchema = Record<string, unknown>;

export interface ConduitToolDefinition {
  name: string;
  description: string;
  httpMethod: 'GET' | 'POST' | 'PATCH';
  path: string;
  parametersSchema: JsonSchema;
  injectPhoneParamName?: string;
  pausesBotMinutes?: number;
  pinResultInMemory?: boolean;
  requiresImageAttachment?: boolean;
  imageParamName?: string;
}

const PHONE = {
  type: 'string',
  description: 'Teléfono del chat. Lo completa Conduit; no lo pidas.',
};
const UUID = (description: string) => ({
  type: 'string',
  format: 'uuid',
  description,
});
const DATE = (description: string) => ({
  type: 'string',
  format: 'date',
  description: `${description} (YYYY-MM-DD, hora de Bogotá)`,
});
const CONSENTS = {
  type: 'array',
  description:
    'Consentimientos que la clienta aceptó o rechazó de forma explícita en el chat.',
  items: {
    type: 'object',
    required: ['type', 'accepted', 'policyVersion'],
    properties: {
      type: {
        enum: [
          'DATOS_SALUD',
          'MARKETING',
          'TERMINOS_SERVICIO',
          'AUTORIZACION_MENOR',
        ],
      },
      accepted: { type: 'boolean' },
      policyVersion: { type: 'string' },
    },
  },
};

export const CONDUIT_TOOL_CATALOG: readonly ConduitToolDefinition[] = [
  {
    name: 'consultar_cliente',
    description:
      'Busca a la clienta del chat por su teléfono en el CRM. Devuelve registered, su nombre (name y firstName), si aceptó los términos (termsAccepted) y su perfil capilar (hairProfile.status VALID, EXPIRED o MISSING). Llámala al inicio de la conversación y antes de pedir datos o dar precios.',
    httpMethod: 'GET',
    path: '/conduit/clients/me',
    pinResultInMemory: true,
    parametersSchema: { type: 'object', properties: {} },
  },
  {
    name: 'info_negocio',
    description:
      'Datos reales del spa: anticipo (monto e instrucciones de pago), políticas, dirección y horario semanal. Úsala antes de responder sobre pagos, políticas, ubicación u horario; nunca inventes estos datos.',
    httpMethod: 'GET',
    path: '/conduit/business-info',
    parametersSchema: { type: 'object', properties: {} },
  },
  {
    name: 'info_productos',
    description:
      'Productos de la tienda: precio por marca y presentación, para qué sirve, beneficios, modo de uso, precauciones y los tratamientos con los que se recomienda. Úsala cuando pregunten por un producto, su precio, si lo tienen o qué recomiendas para un tratamiento o necesidad; query es lo que pidió la clienta, o vacío para ver el catálogo. El sistema no lleva inventario: disponible significa que está en el catálogo, no que haya unidades. Incluye los Rituales (combos con precio especial, type ritual) con lo que traen y el ahorro; si un resultado trae hint, síguelo.',
    httpMethod: 'GET',
    path: '/conduit/products',
    parametersSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          maxLength: 80,
          description:
            'Producto o necesidad tal como la dijo la clienta, por ejemplo "shampoo para cabello seco"',
        },
      },
    },
  },
  {
    name: 'solicitar_compra_producto',
    description:
      'Avisa al equipo que la clienta quiere COMPRAR un producto, con su número y lo que pidió. Úsala solo cuando ella diga que lo quiere comprar o pida comprarlo, nunca por una simple consulta de información o precio. No pausa el asistente.',
    httpMethod: 'POST',
    path: '/conduit/products/purchase-request',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['request'],
      properties: {
        phone: PHONE,
        request: {
          type: 'string',
          minLength: 3,
          maxLength: 400,
          description:
            'Producto, marca, presentación y cantidad que quiere comprar',
        },
        notes: {
          type: 'string',
          maxLength: 600,
          description: 'Algo más que el equipo deba saber',
        },
      },
    },
  },
  {
    name: 'listar_tratamientos',
    description:
      'Servicios activos con id, precio en pesos, duración y promoción vigente (promotion). Si la clienta tiene perfil capilar vigente el precio es el suyo (personalizedPrice); si no, es un rango (priceIsRange) y el precio final se confirma tras el diagnóstico en el spa. Úsala antes de ofrecer un servicio, cuando pregunten precios o promociones, o si hay ambigüedad.',
    httpMethod: 'GET',
    path: '/conduit/booking/treatments',
    parametersSchema: { type: 'object', properties: {} },
  },
  {
    name: 'recomendar_para',
    description:
      'Qué recomienda el spa para lo que le pasa a la clienta en su cabello o cuero cabelludo (caída, frizz, resequedad, grasa, caspa, puntas, daño, color, volumen): devuelve los servicios y los productos o kits del catálogo que coinciden, con su porqué (why) y precio. Úsala siempre que cuente un problema o pida una recomendación.',
    httpMethod: 'GET',
    path: '/conduit/recommendations',
    parametersSchema: {
      type: 'object',
      required: ['need'],
      properties: {
        need: {
          type: 'string',
          maxLength: 200,
          description: 'Lo que contó la clienta, con sus palabras',
        },
      },
    },
  },
  {
    name: 'guardar_precio_del_equipo',
    description:
      'Guarda el precio que una persona del equipo ([Persona del equipo] en el historial) le dio a esta clienta para un servicio de precio variable. Se verifica contra el mensaje real del equipo y, al agendar ese servicio, se cobra ese precio. Nunca la uses con un precio que dijiste tú o que diga la clienta.',
    httpMethod: 'POST',
    path: '/conduit/team-quotes',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['treatmentName', 'price'],
      properties: {
        phone: PHONE,
        treatmentName: {
          type: 'string',
          minLength: 2,
          maxLength: 80,
          description: 'El servicio al que se refiere el precio',
        },
        price: {
          type: 'integer',
          minimum: 10000,
          maximum: 10000000,
          description:
            'El precio que escribió el equipo, en pesos y solo dígitos (350000)',
        },
      },
    },
  },
  {
    name: 'info_tratamiento',
    description:
      'Ficha de UN tratamiento por su nombre: qué es, para quién, beneficios, precio (con la aclaración de rango o precio propio), duración y si requiere valoración. Si el nombre es ambiguo devuelve las opciones.',
    httpMethod: 'GET',
    path: '/conduit/booking/treatments/detail',
    parametersSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 2,
          maxLength: 80,
          description: 'Nombre del tratamiento tal como lo dijo la clienta',
        },
      },
    },
  },
  {
    name: 'consultar_disponibilidad',
    description:
      'Horarios libres de un servicio en un día. Ofrece solo los horarios que devuelva.',
    httpMethod: 'GET',
    path: '/conduit/booking/availability',
    parametersSchema: {
      type: 'object',
      required: ['treatmentId', 'date'],
      properties: {
        treatmentId: UUID('Servicio devuelto por listar_tratamientos'),
        date: DATE('Día a consultar'),
      },
    },
  },
  {
    name: 'disponibilidad_combo',
    description:
      'Horarios libres para varios servicios seguidos (combo) o para un rango de días. Usa purpose=RESCHEDULE cuando la clienta va a reagendar.',
    httpMethod: 'GET',
    path: '/conduit/booking/availability/calendar',
    parametersSchema: {
      type: 'object',
      required: ['treatmentIds', 'from', 'to'],
      properties: {
        treatmentIds: {
          type: 'string',
          description: 'IDs de servicios separados por coma (máximo 5)',
        },
        from: DATE('Primer día'),
        to: DATE('Último día'),
        purpose: { enum: ['CREATE', 'RESCHEDULE'] },
      },
    },
  },
  {
    name: 'registrar_cliente',
    description:
      'Registra a una clienta nueva (nombre completo y fecha de nacimiento) o actualiza sus consentimientos. Úsala al inicio si no sabes si ya es clienta.',
    httpMethod: 'POST',
    path: '/conduit/clients',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone'],
      properties: {
        phone: PHONE,
        name: { type: 'string', description: 'Nombre completo' },
        birthDate: DATE('Fecha de nacimiento'),
        isPregnant: {
          type: 'boolean',
          description: 'Solo con consentimiento DATOS_SALUD',
        },
        allergies: {
          type: 'string',
          description: 'Solo con consentimiento DATOS_SALUD',
        },
        consents: CONSENTS,
      },
    },
  },
  {
    name: 'actualizar_perfil_cliente',
    description:
      'Actualiza embarazo, alergias o consentimientos de una clienta registrada. Pide antes consentimiento explícito para datos de salud.',
    httpMethod: 'PATCH',
    path: '/conduit/clients',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone'],
      properties: {
        phone: PHONE,
        isPregnant: { type: 'boolean' },
        allergies: { type: 'string' },
        consents: CONSENTS,
      },
    },
  },
  {
    name: 'crear_reserva_whatsapp',
    description:
      'Crea la reserva cuando la clienta confirmó servicio(s), fecha y hora exactos. Llámala una sola vez y comunica el estado y el resumen que devuelva (el precio ya incluye la promoción vigente).',
    httpMethod: 'POST',
    path: '/conduit/booking/reservations',
    injectPhoneParamName: 'client.phone',
    parametersSchema: {
      type: 'object',
      required: ['client', 'scheduledStart'],
      properties: {
        client: {
          type: 'object',
          required: ['phone'],
          properties: {
            phone: PHONE,
            name: {
              type: 'string',
              description: 'Obligatorio si es clienta nueva',
            },
            birthDate: DATE('Obligatoria si es clienta nueva'),
            isPregnant: { type: 'boolean' },
            allergies: { type: 'string' },
            consent: {
              type: 'object',
              required: ['healthDataConsent', 'policyVersion'],
              properties: {
                healthDataConsent: { type: 'boolean' },
                policyVersion: { type: 'string' },
              },
            },
          },
        },
        treatments: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', format: 'uuid' },
          description: 'IDs de los servicios confirmados (si los tienes)',
        },
        treatmentNames: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 2, maxLength: 80 },
          description:
            'Nombres de los servicios confirmados, como se los dijiste a la clienta. Úsalo si no tienes el id: no hace falta consultar la lista de nuevo',
        },
        scheduledStart: {
          type: 'string',
          description:
            'Inicio con zona horaria de Bogotá, p. ej. 2026-10-17T15:00:00-05:00',
        },
      },
    },
  },
  {
    name: 'reservas_proximas',
    description:
      'Citas futuras de la clienta del chat, agrupadas por día. Úsala antes de consultar, cancelar o reagendar.',
    httpMethod: 'GET',
    path: '/conduit/booking/reservations/upcoming',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone'],
      properties: { phone: PHONE },
    },
  },
  {
    name: 'reagendar_reserva_whatsapp',
    description:
      'Mueve una cita a un horario devuelto por disponibilidad_combo con purpose=RESCHEDULE, tras confirmación explícita.',
    httpMethod: 'POST',
    path: '/conduit/booking/reservations/reschedule',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone', 'reservationId', 'newScheduledStart'],
      properties: {
        phone: PHONE,
        reservationId: UUID('Cita devuelta por reservas_proximas'),
        newScheduledStart: {
          type: 'string',
          description:
            'Nuevo inicio con zona horaria, p. ej. 2026-10-17T15:00:00-05:00',
        },
      },
    },
  },
  {
    name: 'enlace_cancelacion',
    description:
      'Enlace seguro para que la clienta gestione o cancele su próxima cita sin escribir al spa. Úsala cuando quiera cancelar y prefiera el enlace.',
    httpMethod: 'GET',
    path: '/conduit/booking/reservations/cancellation-link',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone'],
      properties: { phone: PHONE },
    },
  },
  {
    name: 'cancelar_reserva_whatsapp',
    description:
      'Cancela una cita (SINGLE) o todas las del día (DAY) tras confirmación explícita. Ofrece reagendar antes. Los anticipos no se devuelven.',
    httpMethod: 'POST',
    path: '/conduit/booking/reservations/cancel',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone', 'reservationId', 'scope'],
      properties: {
        phone: PHONE,
        reservationId: UUID('Cita devuelta por reservas_proximas'),
        scope: { enum: ['SINGLE', 'DAY'] },
        reason: { type: 'string', maxLength: 300 },
      },
    },
  },
  {
    name: 'depositos_pendientes',
    description:
      'Reservas de la clienta que esperan anticipo, con monto y plazo. Úsala cuando vaya a enviar o pregunte por un anticipo.',
    httpMethod: 'GET',
    path: '/deposits/pending',
    injectPhoneParamName: 'phone',
    parametersSchema: {
      type: 'object',
      required: ['phone'],
      properties: { phone: PHONE },
    },
  },
  {
    name: 'registrar_comprobante_automatico',
    description:
      'Sube la foto del comprobante que la clienta envió para que el equipo la revise. No confirma el pago ni registra montos. Sin reservationId usa la única reserva pendiente.',
    httpMethod: 'POST',
    path: '/deposits/automatic',
    injectPhoneParamName: 'phone',
    requiresImageAttachment: true,
    imageParamName: 'imageBase64',
    parametersSchema: {
      type: 'object',
      required: ['phone'],
      properties: {
        phone: PHONE,
        reservationId: UUID('Opcional si solo hay una reserva pendiente'),
      },
    },
  },
  {
    name: 'avisar_a_leo',
    description:
      'Avisa SOLO a Leo, la dueña, que esta clienta necesita hablar con ella (un tema que no es una cita o insiste en hablar con Leo). Su número nunca se da. Pausa el asistente en este chat salvo para preguntas de citas.',
    httpMethod: 'POST',
    path: '/conduit/handoff/owner',
    injectPhoneParamName: 'phone',
    pausesBotMinutes: 240,
    parametersSchema: {
      type: 'object',
      required: ['reason'],
      properties: {
        phone: PHONE,
        reason: { type: 'string', minLength: 3, maxLength: 300 },
        summary: { type: 'string', maxLength: 1000 },
      },
    },
  },
  {
    name: 'pasar_a_persona',
    description:
      'Pasa la conversación a una persona del spa: si la clienta lo pide, hay una queja, un tema de salud, un tema interno que no es una cita (pagos que no son un anticipo pendiente, fotos o videos de su visita, facturas) o dos intentos fallidos. Avisa al equipo y pausa el asistente en este chat salvo para preguntas de citas.',
    httpMethod: 'POST',
    path: '/conduit/handoff',
    injectPhoneParamName: 'phone',
    pausesBotMinutes: 240,
    parametersSchema: {
      type: 'object',
      required: ['reason'],
      properties: {
        phone: PHONE,
        reason: { type: 'string', minLength: 3, maxLength: 300 },
        summary: { type: 'string', maxLength: 1000 },
      },
    },
  },
];
