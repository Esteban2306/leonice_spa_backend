import { BROADCAST_CATALOG } from './conduit-broadcast-templates';

export type ConduitTemplateAudience = 'CLIENT' | 'ADMIN';

export type ConduitTemplateChannel = 'WHATSAPP' | 'EMAIL';

export interface ConduitTemplateDefinition {
  code: string;
  envKey: string;
  name: string;
  description: string;
  audience: ConduitTemplateAudience;
  channel?: ConduitTemplateChannel;
  subject?: string;
  variables: readonly string[];
  marketing?: boolean;
  followUp?: boolean;
  body: string;
  variants?: readonly string[];
}

export const templateChannel = (
  template: Pick<ConduitTemplateDefinition, 'channel'>,
): ConduitTemplateChannel => template.channel ?? 'WHATSAPP';

const emailLayout = (title: string, rows: string[], footer: string) =>
  [
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#2b2b2b;line-height:1.5">',
    `<h2 style="font-size:18px;margin:0 0 12px">${title}</h2>`,
    ...rows.map((row) => `<p style="margin:0 0 6px">${row}</p>`),
    `<p style="margin:16px 0 0;color:#666">${footer}</p>`,
    '<p style="margin:16px 0 0;font-size:12px;color:#999">Aviso automático de Leonice Arenas Spa Capilar.</p>',
    '</div>',
  ].join('\n');

export const CONDUIT_TEMPLATE_CATALOG: readonly ConduitTemplateDefinition[] = [
  {
    code: 'RESERVATION_REMINDER',
    envKey: 'CONDUIT_TEMPLATE_RESERVATION_REMINDER',
    name: 'leonice_recordatorio_cita',
    description:
      'Recordatorio automático de una cita confirmada, unas horas antes.',
    audience: 'CLIENT',
    variables: ['nombre', 'fecha'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Te recordamos tu cita en Leonice Arenas Spa Capilar el *{{fecha}}*.',
      '',
      '¿Nos confirmas tu asistencia? Si necesitas reprogramar o cancelar, respóndenos por aquí y te ayudamos.',
    ].join('\n'),
    variants: [
      [
        'Hola {{nombre}} 🌿',
        '',
        'Te escribimos de Leonice Arenas Spa Capilar para recordarte que tu cita es el *{{fecha}}*.',
        '',
        '¿Confirmas que podrás asistir? Si necesitas cambiarla o cancelarla, respóndenos por aquí y lo resolvemos.',
      ].join('\n'),
      [
        '{{nombre}}, ¡qué gusto saludarte! 🌿',
        '',
        'Tu cita en Leonice Arenas Spa Capilar está programada para el *{{fecha}}*.',
        '',
        'Cuéntanos por aquí si vas a asistir o si prefieres reprogramar o cancelar; te ayudamos con gusto.',
      ].join('\n'),
    ],
  },
  {
    code: 'REACTIVATION',
    marketing: true,
    followUp: true,
    envKey: 'CONDUIT_TEMPLATE_REACTIVATION',
    name: 'leonice_reactivacion',
    description:
      'Invitación a volver para clientas que llevan días sin agendar (solo con consentimiento de marketing).',
    audience: 'CLIENT',
    variables: ['nombre', 'dias'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Ya pasaron {{dias}} días desde tu última visita a Leonice Arenas Spa Capilar y queremos seguir cuidando tu cabello.',
      '',
      '¿Te gustaría agendar tu próxima cita? Respóndenos por aquí y te mostramos los horarios disponibles.',
    ].join('\n'),
    variants: [
      [
        'Hola {{nombre}} 🌿',
        '',
        'Hace {{dias}} días no te vemos en Leonice Arenas Spa Capilar y nos encantaría seguir cuidando tu cabello.',
        '',
        '¿Quieres que te ayudemos a agendar tu próxima cita? Respóndenos por aquí y te compartimos los horarios libres.',
      ].join('\n'),
      [
        '{{nombre}}, ¿cómo has estado? 🌿',
        '',
        'Han pasado {{dias}} días desde tu última visita a Leonice Arenas Spa Capilar. Con gusto retomamos el cuidado de tu cabello.',
        '',
        'Si quieres agendar, escríbenos por aquí y te mostramos los horarios disponibles.',
      ].join('\n'),
    ],
  },
  {
    code: 'REACTIVATION_PROMO',
    marketing: true,
    followUp: true,
    envKey: 'CONDUIT_TEMPLATE_REACTIVATION_PROMO',
    name: 'leonice_reactivacion_promocion',
    description:
      'Invitación a volver con una promoción vigente asociada a la regla de reactivación.',
    audience: 'CLIENT',
    variables: ['nombre', 'dias', 'promocion', 'descuento'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Ya pasaron {{dias}} días desde tu última visita y tenemos algo para ti: *{{promocion}}* con *{{descuento}}% de descuento*.',
      '',
      '¿Quieres que te ayudemos a agendar? Respóndenos por aquí y te mostramos los horarios disponibles.',
    ].join('\n'),
    variants: [
      [
        'Hola {{nombre}} 🌿',
        '',
        'Hace {{dias}} días no vienes y te tenemos una sorpresa: *{{promocion}}* con *{{descuento}}% de descuento*.',
        '',
        '¿Te ayudamos a agendar? Respóndenos por aquí y te compartimos los horarios disponibles.',
      ].join('\n'),
      [
        '{{nombre}}, te extrañamos 🌿',
        '',
        'Desde tu última visita pasaron {{dias}} días, y por eso tenemos para ti *{{promocion}}* con *{{descuento}}% de descuento*.',
        '',
        'Si te interesa, escríbenos por aquí y reservamos tu horario.',
      ].join('\n'),
    ],
  },
  {
    code: 'MAINTENANCE_REMINDER',
    marketing: true,
    followUp: true,
    envKey: 'CONDUIT_TEMPLATE_MAINTENANCE_REMINDER',
    name: 'leonice_recordatorio_mantenimiento',
    description:
      'Recordatorio de mantenimiento días después de un tratamiento concreto (solo con consentimiento de marketing).',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamiento', 'dias'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Ya van {{dias}} días desde tu {{tratamiento}} en Leonice Arenas Spa Capilar y se acerca el momento de tu mantenimiento.',
      '',
      '¿Te ayudamos a agendar? Respóndenos por aquí y te mostramos los horarios disponibles.',
    ].join('\n'),
    variants: [
      [
        '{{nombre}}, ¿cómo te ha ido con tu {{tratamiento}}? 🌿',
        '',
        'Han pasado {{dias}} días y es un buen momento para tu sesión de mantenimiento: así los resultados duran más.',
        '',
        'Si quieres, escríbenos por aquí y reservamos tu horario.',
      ].join('\n'),
      [
        'Hola {{nombre}} 🌿',
        '',
        'Para mantener los resultados de tu {{tratamiento}}, te recomendamos agendar tu próxima sesión: ya pasaron {{dias}} días.',
        '',
        'Respóndenos por aquí y te ayudamos a escoger tu día.',
      ].join('\n'),
    ],
  },
  {
    code: 'PROMOTION_BROADCAST',
    marketing: true,
    envKey: 'CONDUIT_TEMPLATE_PROMOTION_BROADCAST',
    name: 'leonice_promocion',
    description:
      'Anuncio de una promoción vigente para las clientas elegidas en una campaña (solo con consentimiento de marketing).',
    audience: 'CLIENT',
    variables: ['nombre', 'promocion', 'descuento', 'vigencia'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'En Leonice Arenas Spa Capilar tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
      '',
      '¿Te gustaría aprovecharla? Respóndenos por aquí y te mostramos los horarios disponibles.',
    ].join('\n'),
    variants: [
      [
        '{{nombre}}, ¡tenemos algo para ti! 🌿',
        '',
        'Leonice Arenas Spa Capilar tiene *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        '',
        'Si te interesa, escríbenos por aquí y reservamos tu horario.',
      ].join('\n'),
      [
        'Hola {{nombre}} 🌿',
        '',
        'Te cuento que ahora puedes disfrutar *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        '',
        'Respóndenos por aquí y te ayudamos a agendar con gusto.',
      ].join('\n'),
    ],
  },
  ...BROADCAST_CATALOG,
  {
    code: 'CLIENT_DEPOSIT_REJECTED',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED',
    name: 'leonice_abono_rechazado',
    description:
      'La clienta envió un comprobante que no se pudo validar y todavía tiene plazo para enviar otro.',
    audience: 'CLIENT',
    variables: ['nombre', 'plazo'],
    body: [
      'Hola {{nombre}}, revisamos el comprobante de tu abono y no pudimos validarlo.',
      '',
      'Tu cita sigue apartada {{plazo}}. Envíanos por aquí una foto clara del comprobante para confirmarla.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_DEPOSIT_REJECTED_NO_DEADLINE',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED_NO_DEADLINE',
    name: 'leonice_abono_rechazado_sin_plazo',
    description:
      'La clienta envió un comprobante que no se pudo validar y la reserva no tiene plazo de abono.',
    audience: 'CLIENT',
    variables: ['nombre'],
    body: [
      'Hola {{nombre}}, revisamos el comprobante de tu abono y no pudimos validarlo.',
      '',
      'Envíanos por aquí una foto clara del comprobante y lo revisamos de nuevo.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_RESERVATION_CONFIRMED',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_RESERVATION_CONFIRMED',
    name: 'leonice_cita_aceptada',
    description:
      'Avisa a la clienta que el spa revisó su comprobante y aceptó la cita.',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamiento', 'fecha'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Revisamos tu comprobante y tu cita de *{{tratamiento}}* fue aceptada. Te esperamos en Leonice Arenas Spa Capilar el *{{fecha}}*.',
      '',
      'Si necesitas reprogramar o cancelar, respóndenos por aquí y te ayudamos.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_CANCELLED_BY_ADMIN',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_CANCELLED_BY_ADMIN',
    name: 'leonice_cita_cancelada_por_spa',
    description:
      'Avisa a la clienta que el spa canceló su cita e incluye el motivo que escribió la administradora.',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamiento', 'fecha', 'motivo'],
    body: [
      'Hola {{nombre}}, lamentamos informarte que tu cita de *{{tratamiento}}* del {{fecha}} fue cancelada.',
      '',
      '*Motivo:* {{motivo}}',
      '',
      'Si quieres agendar de nuevo, escríbenos por aquí y con gusto te ayudamos. 🌿',
    ].join('\n'),
  },
  {
    code: 'CLIENT_RESCHEDULED',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_RESCHEDULED',
    name: 'leonice_cita_reprogramada',
    description:
      'Confirma a la clienta la nueva fecha de una cita reprogramada.',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamiento', 'fecha'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Tu cita de *{{tratamiento}}* quedó reprogramada para el *{{fecha}}*.',
      '',
      'Si tienes alguna duda, respóndenos por aquí.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_CANCELLATION_CONFIRMED',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_CANCELLATION_CONFIRMED',
    name: 'leonice_cancelacion_confirmada',
    description: 'Confirma a la clienta que su cita quedó cancelada.',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamientos', 'fecha'],
    body: [
      'Hola {{nombre}}, tu cita de *{{tratamientos}}* del {{fecha}} quedó cancelada.',
      '',
      'Cuando quieras volver a agendar, escríbenos por aquí. ¡Te esperamos! 🌿',
    ].join('\n'),
  },
  {
    code: 'CLIENT_CANCELLATION_LINK',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_CANCELLATION_LINK',
    name: 'leonice_enlace_cancelacion',
    description:
      'Envía a la clienta el enlace seguro para cancelar su cita sin escribir al spa.',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamiento', 'fecha', 'enlace'],
    body: [
      'Hola {{nombre}}, aquí tienes el enlace para gestionar tu cita de *{{tratamiento}}* del {{fecha}}:',
      '',
      '{{enlace}}',
      '',
      'Si prefieres reprogramar, respóndenos por aquí y te ayudamos.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_DEPOSIT_TIMEOUT',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_DEPOSIT_TIMEOUT',
    name: 'leonice_aviso_abono_vencido',
    description:
      'Aviso interno: una reserva se canceló porque la clienta no envió el abono a tiempo.',
    audience: 'ADMIN',
    variables: ['cliente', 'telefono', 'tratamientos', 'fecha'],
    body: [
      '⏰ *Reserva cancelada por abono vencido*',
      '',
      'Clienta: {{cliente}} ({{telefono}})',
      'Servicios: {{tratamientos}}',
      'Fecha: {{fecha}}',
      '',
      'Si la clienta ya pagó, puedes revivir la reserva desde el panel.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_RESCHEDULED',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_RESCHEDULED',
    name: 'leonice_aviso_reprogramacion',
    description: 'Aviso interno: una cita cambió de fecha.',
    audience: 'ADMIN',
    variables: [
      'cliente',
      'telefono',
      'tratamiento',
      'fecha_anterior',
      'fecha_nueva',
      'origen',
    ],
    body: [
      '🔁 *Cita reprogramada por {{origen}}*',
      '',
      'Clienta: {{cliente}} ({{telefono}})',
      'Servicio: {{tratamiento}}',
      'Antes: {{fecha_anterior}}',
      'Ahora: {{fecha_nueva}}',
    ].join('\n'),
  },
  {
    code: 'ADMIN_CLIENT_CANCELLED',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_CLIENT_CANCELLED',
    name: 'leonice_aviso_cancelacion_clienta',
    description: 'Aviso interno: una clienta canceló su cita.',
    audience: 'ADMIN',
    variables: ['cliente', 'telefono', 'tratamientos', 'fecha', 'canal'],
    body: [
      '❌ *Cita cancelada por la clienta* (desde {{canal}})',
      '',
      'Clienta: {{cliente}} ({{telefono}})',
      'Servicios: {{tratamientos}}',
      'Fecha: {{fecha}}',
      '',
      'El espacio quedó libre en la agenda.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_HANDOFF',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_HANDOFF',
    name: 'leonice_aviso_atencion_humana',
    description:
      'Aviso interno: una clienta pidió hablar con una persona y el bot quedó en pausa en su chat.',
    audience: 'ADMIN',
    variables: ['cliente', 'telefono', 'motivo', 'resumen'],
    body: [
      '🙋 *Una clienta necesita atención personal*',
      '',
      'Clienta: {{cliente}}',
      'Teléfono: {{telefono}}',
      'Motivo: {{motivo}}',
      'Resumen: {{resumen}}',
      '',
      'El asistente quedó en pausa en ese chat. Respóndele desde WhatsApp o desde el panel.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_DEPOSIT_TIMEOUT_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_DEPOSIT_TIMEOUT_EMAIL',
    name: 'leonice_correo_aviso_abono_vencido',
    description:
      'Correo interno: una reserva se canceló porque la clienta no envió el abono a tiempo.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Reserva cancelada por abono vencido: {{cliente}}',
    variables: ['cliente', 'telefono', 'tratamientos', 'fecha'],
    body: emailLayout(
      'Reserva cancelada por abono vencido',
      [
        '<strong>Clienta:</strong> {{cliente}} ({{telefono}})',
        '<strong>Servicios:</strong> {{tratamientos}}',
        '<strong>Fecha:</strong> {{fecha}}',
      ],
      'Si la clienta ya pagó, puedes revivir la reserva desde el panel.',
    ),
  },
  {
    code: 'ADMIN_RESCHEDULED_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_RESCHEDULED_EMAIL',
    name: 'leonice_correo_aviso_reprogramacion',
    description: 'Correo interno: una cita cambió de fecha.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Cita reprogramada: {{cliente}}',
    variables: [
      'cliente',
      'telefono',
      'tratamiento',
      'fecha_anterior',
      'fecha_nueva',
      'origen',
    ],
    body: emailLayout(
      'Cita reprogramada por {{origen}}',
      [
        '<strong>Clienta:</strong> {{cliente}} ({{telefono}})',
        '<strong>Servicio:</strong> {{tratamiento}}',
        '<strong>Antes:</strong> {{fecha_anterior}}',
        '<strong>Ahora:</strong> {{fecha_nueva}}',
      ],
      'La agenda ya refleja el cambio.',
    ),
  },
  {
    code: 'ADMIN_CLIENT_CANCELLED_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_CLIENT_CANCELLED_EMAIL',
    name: 'leonice_correo_aviso_cancelacion_clienta',
    description: 'Correo interno: una clienta canceló su cita.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Cita cancelada por la clienta: {{cliente}}',
    variables: ['cliente', 'telefono', 'tratamientos', 'fecha', 'canal'],
    body: emailLayout(
      'Cita cancelada por la clienta (desde {{canal}})',
      [
        '<strong>Clienta:</strong> {{cliente}} ({{telefono}})',
        '<strong>Servicios:</strong> {{tratamientos}}',
        '<strong>Fecha:</strong> {{fecha}}',
      ],
      'El espacio quedó libre en la agenda.',
    ),
  },
  {
    code: 'ADMIN_HANDOFF_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_HANDOFF_EMAIL',
    name: 'leonice_correo_aviso_atencion_humana',
    description:
      'Correo interno: una clienta pidió hablar con una persona y el bot quedó en pausa en su chat.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Una clienta necesita atención personal: {{cliente}}',
    variables: ['cliente', 'telefono', 'motivo', 'resumen'],
    body: emailLayout(
      'Una clienta necesita atención personal',
      [
        '<strong>Clienta:</strong> {{cliente}}',
        '<strong>Teléfono:</strong> {{telefono}}',
        '<strong>Motivo:</strong> {{motivo}}',
        '<strong>Resumen:</strong> {{resumen}}',
      ],
      'El asistente quedó en pausa en ese chat. Respóndele desde WhatsApp o desde el panel.',
    ),
  },
];

const PLACEHOLDER = /{{\s*([a-zA-Z_][\w]*)\s*}}/g;

export function templatePlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

export const BROADCAST_VARIABLES = [
  'nombre',
  'dias',
  'promocion',
  'descuento',
  'vigencia',
] as const;

export function isBroadcastTemplate(
  template: ConduitTemplateDefinition,
): boolean {
  return (
    template.marketing === true &&
    template.audience === 'CLIENT' &&
    templateChannel(template) === 'WHATSAPP' &&
    template.variables.every((variable) =>
      (BROADCAST_VARIABLES as readonly string[]).includes(variable),
    )
  );
}

export const FOLLOW_UP_TEMPLATES: readonly ConduitTemplateDefinition[] =
  CONDUIT_TEMPLATE_CATALOG.filter((template) => template.followUp === true);

export const BROADCAST_TEMPLATES: readonly ConduitTemplateDefinition[] =
  CONDUIT_TEMPLATE_CATALOG.filter(isBroadcastTemplate);
