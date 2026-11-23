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
    code: 'CLIENT_DEPOSIT_REMINDER',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REMINDER',
    name: 'leonice_recordatorio_anticipo',
    description:
      'Recuerda a la clienta, poco antes de que venza el plazo, que su cita sigue apartada y falta el anticipo.',
    audience: 'CLIENT',
    variables: ['nombre', 'tratamiento', 'fecha', 'plazo'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Tu cita de *{{tratamiento}}* del *{{fecha}}* sigue apartada. Para dejarla firme falta el anticipo, y el plazo vence {{plazo}}.',
      '',
      'Si ya lo pagaste, envíanos por aquí la foto del comprobante. Si necesitas otra fecha, cuéntanos y te ayudamos.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_LEAD_FOLLOW_UP',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_LEAD_FOLLOW_UP',
    name: 'leonice_seguimiento_interesada',
    description:
      'Un solo mensaje a quien dejó sus datos por WhatsApp y todavía no agendó.',
    audience: 'CLIENT',
    variables: ['nombre'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Te escribimos de Leonice Arenas Spa Capilar por si quieres agendar tu cita. Cuando quieras, respóndenos por aquí y te mostramos los horarios disponibles.',
      '',
      'Si prefieres que no te escribamos, dínoslo y no volvemos a hacerlo.',
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
    code: 'CLIENT_EVENT_TICKET',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_EVENT_TICKET',
    name: 'leonice_boleta_evento',
    description:
      'Le entrega a la clienta su boleta numerada de un evento del spa (por ejemplo una rifa) después de completar su visita.',
    audience: 'CLIENT',
    variables: ['nombre', 'evento', 'boleta'],
    body: [
      '🎟️ Hola {{nombre}}',
      '',
      'Gracias por tu visita. Ya participas en *{{evento}}* con la boleta *#{{boleta}}*.',
      '',
      '¡Mucha suerte! Te avisaremos por aquí si resultas ganadora 🌿',
    ].join('\n'),
  },
  {
    code: 'CLIENT_EVENT_WINNER',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_EVENT_WINNER',
    name: 'leonice_ganadora_evento',
    description:
      'Le avisa a la clienta que su boleta ganó en el sorteo de un evento del spa y qué premio recibe.',
    audience: 'CLIENT',
    variables: ['nombre', 'evento', 'boleta', 'premio'],
    body: [
      '🎉 ¡Felicitaciones, {{nombre}}!',
      '',
      'Tu boleta *#{{boleta}}* ganó en *{{evento}}*. Tu premio: *{{premio}}*.',
      '',
      'Respóndenos por aquí para coordinar la entrega 🌿',
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
    code: 'ADMIN_PRODUCT_PURCHASE',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PURCHASE',
    name: 'leonice_aviso_compra_producto',
    description:
      'Aviso interno: una clienta pidió productos por WhatsApp; el pedido ya tiene total y forma de pago.',
    audience: 'ADMIN',
    variables: ['cliente', 'telefono', 'pedido', 'notas'],
    body: [
      '🛍️ *Una clienta quiere comprar un producto*',
      '',
      'Clienta: {{cliente}}',
      'Teléfono: {{telefono}}',
      'Quiere comprar: {{pedido}}',
      'Notas: {{notas}}',
      '',
      'El asistente ya le dio el total y la cuenta para pagar, y sigue activo en ese chat. Cuando envíe el comprobante te avisamos para verificarlo en el panel.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_PRODUCT_PAYMENT',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PAYMENT',
    name: 'leonice_aviso_pago_pedido',
    description:
      'Aviso interno: una clienta envió el comprobante de un pedido de productos y hay que verificarlo en el panel.',
    audience: 'ADMIN',
    variables: [
      'cliente',
      'telefono',
      'pedido',
      'productos',
      'total',
      'pagado',
      'comprobante',
      'panel',
    ],
    body: [
      '💳 *Comprobante de un pedido por verificar*',
      '',
      'Pedido: {{pedido}}',
      'Clienta: {{cliente}}',
      'Teléfono: {{telefono}}',
      'Productos: {{productos}}',
      'Total: {{total}}',
      'Pagó: {{pagado}}',
      'Comprobante: {{comprobante}}',
      '',
      'Verifícalo con un clic en {{panel}}: al confirmarlo le avisamos a la clienta automáticamente.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_PRODUCT_PAYMENT_VERIFIED',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_PRODUCT_PAYMENT_VERIFIED',
    name: 'leonice_pago_pedido_verificado',
    description:
      'La clienta pagó un pedido de productos y el equipo ya verificó el comprobante.',
    audience: 'CLIENT',
    variables: ['nombre', 'pedido', 'total'],
    body: [
      'Hola {{nombre}} 🌿',
      '',
      'Confirmamos el pago de tu pedido *{{pedido}}* por *{{total}}*. ¡Gracias!',
      '',
      'Te escribimos por aquí para coordinar la entrega o la recogida en el spa.',
    ].join('\n'),
  },
  {
    code: 'CLIENT_PRODUCT_PAYMENT_REJECTED',
    envKey: 'CONDUIT_TEMPLATE_CLIENT_PRODUCT_PAYMENT_REJECTED',
    name: 'leonice_pago_pedido_rechazado',
    description:
      'El equipo revisó el comprobante de un pedido de productos y no pudo validarlo.',
    audience: 'CLIENT',
    variables: ['nombre', 'pedido', 'motivo'],
    body: [
      'Hola {{nombre}}, revisamos el comprobante de tu pedido *{{pedido}}* y no pudimos validarlo: {{motivo}}.',
      '',
      'Envíanos por aquí el comprobante correcto y lo revisamos de nuevo.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_IN_PROGRESS',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_IN_PROGRESS',
    name: 'leonice_aviso_citas_en_curso',
    description:
      'Aviso interno al cierre del día: citas que siguen en curso porque nadie las completó ni registró su pago.',
    audience: 'ADMIN',
    variables: ['cantidad', 'citas'],
    body: [
      '🕚 *Citas en curso sin completar: {{cantidad}}*',
      '',
      '{{citas}}',
      '',
      'Complétalas desde el calendario del panel y registra cómo pagó cada clienta.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_HANDOFF',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_HANDOFF',
    name: 'leonice_aviso_atencion_humana',
    description:
      'Aviso interno: una clienta pidió hablar con una persona (o con Leo) y el bot solo responde en su chat preguntas de citas.',
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
      'El asistente solo le responderá preguntas de citas en ese chat. Respóndele desde WhatsApp o desde el panel.',
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
    code: 'ADMIN_PRODUCT_PURCHASE_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_PRODUCT_PURCHASE_EMAIL',
    name: 'leonice_correo_compra_producto',
    description:
      'Correo interno: una clienta pidió productos por WhatsApp; el pedido ya tiene total y forma de pago.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Solicitud de compra de producto: {{cliente}}',
    variables: ['cliente', 'telefono', 'pedido', 'notas'],
    body: emailLayout(
      'Una clienta quiere comprar un producto',
      [
        '<strong>Clienta:</strong> {{cliente}}',
        '<strong>Teléfono:</strong> {{telefono}}',
        '<strong>Quiere comprar:</strong> {{pedido}}',
        '<strong>Notas:</strong> {{notas}}',
      ],
      'El asistente ya le dio el total y la cuenta para pagar, y sigue activo en ese chat. Cuando envíe el comprobante te avisamos para verificarlo en el panel.',
    ),
  },
  {
    code: 'ADMIN_IN_PROGRESS_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_IN_PROGRESS_EMAIL',
    name: 'leonice_correo_citas_en_curso',
    description:
      'Correo interno al cierre del día: citas que siguen en curso porque nadie las completó ni registró su pago.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Citas en curso sin completar: {{cantidad}}',
    variables: ['cantidad', 'citas'],
    body: emailLayout(
      'Citas en curso sin completar: {{cantidad}}',
      ['<div style="white-space:pre-line">{{citas}}</div>'],
      'Complétalas desde el calendario del panel y registra cómo pagó cada clienta.',
    ),
  },
  {
    code: 'ADMIN_HANDOFF_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_HANDOFF_EMAIL',
    name: 'leonice_correo_aviso_atencion_humana',
    description:
      'Correo interno: una clienta pidió hablar con una persona (o con Leo) y el bot solo responde en su chat preguntas de citas.',
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
      'El asistente solo le responderá preguntas de citas en ese chat. Respóndele desde WhatsApp o desde el panel.',
    ),
  },
  {
    code: 'ADMIN_RECEIPT_REVIEW',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_REVIEW',
    name: 'leonice_aviso_comprobante_revision',
    description:
      'Aviso interno: el sistema no pudo validar un comprobante por sí solo y espera que una persona lo revise.',
    audience: 'ADMIN',
    variables: ['cliente', 'telefono', 'motivo'],
    body: [
      '🧾 *Un comprobante necesita tu revisión*',
      '',
      'Clienta: {{cliente}}',
      'Teléfono: {{telefono}}',
      'Motivo: {{motivo}}',
      '',
      'La reserva sigue pendiente de abono. Revisa la foto en el panel y apruébala o recházala.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_RECEIPT_RETRIES',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_RETRIES',
    name: 'leonice_aviso_comprobante_reintentos',
    description:
      'Aviso interno: una clienta lleva varios comprobantes seguidos que no se pudieron validar.',
    audience: 'ADMIN',
    variables: ['cliente', 'telefono', 'intentos', 'motivo'],
    body: [
      '⚠️ *Comprobantes rechazados varias veces*',
      '',
      'Clienta: {{cliente}}',
      'Teléfono: {{telefono}}',
      'Intentos seguidos: {{intentos}}',
      'Último motivo: {{motivo}}',
      '',
      'Escríbele para ayudarla. Puede ser un error al pagar o una foto que no se lee bien.',
    ].join('\n'),
  },
  {
    code: 'ADMIN_RECEIPT_REVIEW_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_REVIEW_EMAIL',
    name: 'leonice_correo_aviso_comprobante_revision',
    description:
      'Correo interno: un comprobante espera la revisión de una persona.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Un comprobante necesita tu revisión: {{cliente}}',
    variables: ['cliente', 'telefono', 'motivo'],
    body: emailLayout(
      'Un comprobante necesita tu revisión',
      [
        '<strong>Clienta:</strong> {{cliente}}',
        '<strong>Teléfono:</strong> {{telefono}}',
        '<strong>Motivo:</strong> {{motivo}}',
      ],
      'La reserva sigue pendiente de abono. Revisa la foto en el panel y apruébala o recházala.',
    ),
  },
  {
    code: 'ADMIN_RECEIPT_RETRIES_EMAIL',
    envKey: 'CONDUIT_TEMPLATE_ADMIN_RECEIPT_RETRIES_EMAIL',
    name: 'leonice_correo_aviso_comprobante_reintentos',
    description:
      'Correo interno: una clienta lleva varios comprobantes seguidos que no se pudieron validar.',
    audience: 'ADMIN',
    channel: 'EMAIL',
    subject: 'Comprobantes rechazados varias veces: {{cliente}}',
    variables: ['cliente', 'telefono', 'intentos', 'motivo'],
    body: emailLayout(
      'Comprobantes rechazados varias veces',
      [
        '<strong>Clienta:</strong> {{cliente}}',
        '<strong>Teléfono:</strong> {{telefono}}',
        '<strong>Intentos seguidos:</strong> {{intentos}}',
        '<strong>Último motivo:</strong> {{motivo}}',
      ],
      'Escríbele para ayudarla. Puede ser un error al pagar o una foto que no se lee bien.',
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
  'evento',
  'detalle',
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
