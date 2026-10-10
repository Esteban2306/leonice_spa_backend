type JsonSchema = Record<string, unknown>;

export interface ConduitToolDefinition {
  name: string;
  description: string;
  httpMethod: 'GET' | 'POST' | 'PATCH';
  path: string;
  parametersSchema: JsonSchema;
  injectPhoneParamName?: string;
  pausesBotMinutes?: number;
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
    name: 'info_negocio',
    description:
      'Datos reales del spa: anticipo (monto e instrucciones de pago), políticas, dirección y horario semanal. Úsala antes de responder sobre pagos, políticas, ubicación u horario; nunca inventes estos datos.',
    httpMethod: 'GET',
    path: '/conduit/business-info',
    parametersSchema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_tratamientos',
    description:
      'Servicios activos con duración, precio y promoción vigente (activePromotion y precio con descuento effectiveBasePriceMin/Max). Úsala antes de ofrecer un servicio, cuando pregunten precios o promociones, o si hay ambigüedad.',
    httpMethod: 'GET',
    path: '/conduit/booking/treatments',
    parametersSchema: {
      type: 'object',
      properties: {
        categoryId: UUID('Opcional: solo los servicios de esta categoría'),
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
      required: ['client', 'treatments', 'scheduledStart'],
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
          description: 'IDs de los servicios confirmados',
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
      'Registra la foto del comprobante de pago que la clienta acaba de enviar. Sin reservationId usa la única reserva pendiente.',
    httpMethod: 'POST',
    path: '/deposits/automatic',
    injectPhoneParamName: 'phone',
    requiresImageAttachment: true,
    imageParamName: 'imageBase64',
    parametersSchema: {
      type: 'object',
      required: ['phone', 'coverage'],
      properties: {
        phone: PHONE,
        coverage: {
          enum: ['ANTICIPO', 'PAGO_COMPLETO'],
          description: 'Si pagó solo el anticipo o el valor completo',
        },
        reservationId: UUID('Opcional si solo hay una reserva pendiente'),
      },
    },
  },
  {
    name: 'pasar_a_persona',
    description:
      'Pasa la conversación a una persona del spa: si la clienta lo pide, hay una queja, un tema de salud o dos intentos fallidos. Avisa al equipo y pausa el asistente en este chat.',
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
