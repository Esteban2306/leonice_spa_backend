export type ConduitTemplateAudience = 'CLIENT' | 'ADMIN';

export interface ConduitTemplateDefinition {
  code: string;
  envKey: string;
  name: string;
  description: string;
  audience: ConduitTemplateAudience;
  variables: readonly string[];
  body: string;
}

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
  },
  {
    code: 'REACTIVATION',
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
  },
  {
    code: 'REACTIVATION_PROMO',
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
  },
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
];

const PLACEHOLDER = /{{\s*([a-zA-Z_][\w]*)\s*}}/g;

export function templatePlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}
