import type { ConduitTemplateDefinition } from './conduit-template-catalog';

const PROMOTION_VARIABLES = [
  'nombre',
  'promocion',
  'descuento',
  'vigencia',
] as const;

const message = (...paragraphs: string[]) => paragraphs.join('\n\n');

function broadcast(
  code: string,
  name: string,
  description: string,
  variables: readonly string[],
  [body, ...variants]: [string, string, string],
): ConduitTemplateDefinition {
  return {
    code,
    envKey: `CONDUIT_TEMPLATE_${code}`,
    name: `leonice_${name}`,
    description,
    audience: 'CLIENT',
    marketing: true,
    variables,
    body,
    variants,
  };
}

export const BROADCAST_CATALOG: readonly ConduitTemplateDefinition[] = [
  broadcast(
    'BIRTHDAY_GREETING',
    'cumpleanos',
    'Saludo de cumpleaños sin promoción, para quienes cumplen años pronto.',
    ['nombre'],
    [
      message(
        'Hola {{nombre}} 🎂',
        'Desde Leonice Arenas Spa Capilar queremos desearte un cumpleaños lleno de bienestar.',
        'Si quieres celebrarlo consintiendo tu cabello, respóndenos por aquí y te ayudamos a agendar.',
      ),
      message(
        '{{nombre}}, ¡se acerca tu día especial! 🎂',
        'Todo el equipo de Leonice Arenas Spa Capilar te manda un abrazo y los mejores deseos.',
        'Cuando quieras regalarte un momento para ti, escríbenos por aquí y reservamos tu horario.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Este mes celebras tu cumpleaños y en Leonice Arenas Spa Capilar nos alegra ser parte de tu cuidado.',
        '¿Te gustaría agendar una cita para consentirte? Respóndenos por aquí.',
      ),
    ],
  ),
  broadcast(
    'BIRTHDAY_PROMO',
    'cumpleanos_promocion',
    'Regalo de cumpleaños con una promoción vigente, para quienes cumplen años pronto.',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🎂',
        'Para celebrar tu cumpleaños en Leonice Arenas Spa Capilar tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        '¿Te ayudamos a agendar? Respóndenos por aquí y te mostramos los horarios disponibles.',
      ),
      message(
        '{{nombre}}, ¡se acerca tu cumpleaños! 🎂',
        'Queremos regalarte *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Si te interesa, escríbenos por aquí y reservamos tu horario.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Tu mes especial merece un detalle: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te ayudamos a escoger el mejor día.',
      ),
    ],
  ),
  broadcast(
    'WOMENS_DAY',
    'dia_de_la_mujer',
    'Promoción para el Día de la Mujer (8 de marzo).',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🌿',
        'En el Día de la Mujer queremos celebrarte con *{{promocion}}* y *{{descuento}}% de descuento* {{vigencia}}.',
        '¿Te gustaría regalarte un momento para ti? Respóndenos por aquí y agendamos.',
      ),
      message(
        '{{nombre}}, hoy te celebramos 💚',
        'Leonice Arenas Spa Capilar tiene para ti *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Escríbenos por aquí y te mostramos los horarios disponibles.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Porque cuidarte también es celebrarte: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y reservamos tu cita.',
      ),
    ],
  ),
  broadcast(
    'MOTHERS_DAY',
    'dia_de_la_madre',
    'Promoción para el mes de las madres (mayo).',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 💐',
        'Para el mes de las madres, en Leonice Arenas Spa Capilar tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Puede ser un regalo para ti o para mamá. Respóndenos por aquí y agendamos.',
      ),
      message(
        '{{nombre}}, ¡feliz mes de las madres! 💐',
        'Queremos acompañarte con *{{promocion}}* y *{{descuento}}% de descuento* {{vigencia}}.',
        'Si te interesa, escríbenos por aquí y reservamos tu horario.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Un detalle de cuidado para mamá y para ti: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te ayudamos a agendar.',
      ),
    ],
  ),
  broadcast(
    'LOVE_FRIENDSHIP',
    'amor_y_amistad',
    'Promoción para Amor y Amistad (septiembre).',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 💚',
        'En Amor y Amistad tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Ven con alguien especial o regálate el momento. Respóndenos por aquí y agendamos.',
      ),
      message(
        '{{nombre}}, ¡llegó Amor y Amistad! 💚',
        'Leonice Arenas Spa Capilar te propone *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Escríbenos por aquí y reservamos tu horario, solo o acompañado.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Un plan de cuidado para compartir: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te mostramos los horarios disponibles.',
      ),
    ],
  ),
  broadcast(
    'BLACK_FRIDAY',
    'black_friday',
    'Promoción para la temporada de ofertas de Black Friday (noviembre).',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🌿',
        'Esta temporada de ofertas tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Los cupos son limitados. Respóndenos por aquí y asegura tu horario.',
      ),
      message(
        '{{nombre}}, llegó nuestra oferta de temporada 🖤',
        'En Leonice Arenas Spa Capilar: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Si te interesa, escríbenos por aquí y reservamos tu cita.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Aprovecha: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te ayudamos a agendar antes de que se llenen los cupos.',
      ),
    ],
  ),
  broadcast(
    'YEAR_END',
    'fin_de_ano',
    'Promoción de Navidad y fin de año (diciembre).',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🎄',
        'Para recibir las fiestas con tu cabello cuidado, tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'En diciembre la agenda se llena rápido. Respóndenos por aquí y asegura tu horario.',
      ),
      message(
        '{{nombre}}, ¡cerremos el año consintiéndote! 🎄',
        'Leonice Arenas Spa Capilar tiene *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Escríbenos por aquí y reservamos tu cita.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Un regalo para ti en estas fiestas: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te mostramos los horarios disponibles.',
      ),
    ],
  ),
  broadcast(
    'BONUS_SEASON',
    'temporada_de_prima',
    'Promoción para la época de la prima (junio y diciembre).',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🌿',
        'Llegó la época de la prima y qué mejor que invertir en ti: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        '¿Te ayudamos a agendar? Respóndenos por aquí.',
      ),
      message(
        '{{nombre}}, es momento de consentirte ✨',
        'En Leonice Arenas Spa Capilar tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Si te interesa, escríbenos por aquí y reservamos tu horario.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Para esta temporada te ofrecemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te mostramos los horarios disponibles.',
      ),
    ],
  ),
  broadcast(
    'LAST_DAYS',
    'promocion_ultimos_dias',
    'Aviso de que una promoción vigente está por terminar.',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🌿',
        'Te recordamos que *{{promocion}}* con *{{descuento}}% de descuento* está disponible {{vigencia}}.',
        'Si quieres aprovecharla, respóndenos por aquí y reservamos tu horario.',
      ),
      message(
        '{{nombre}}, no te quedes sin aprovecharla',
        'La promoción *{{promocion}}* con *{{descuento}}% de descuento* está por terminar {{vigencia}}.',
        'Escríbenos por aquí y te ayudamos a agendar.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Últimos días para *{{promocion}}* con *{{descuento}}% de descuento*: aplica {{vigencia}}.',
        'Respóndenos por aquí y te mostramos los horarios disponibles.',
      ),
    ],
  ),
  broadcast(
    'REFERRAL',
    'invita_una_amiga',
    'Invitación para que la clienta comparta una promoción vigente con alguien cercana.',
    PROMOTION_VARIABLES,
    [
      message(
        'Hola {{nombre}} 🌿',
        'Cuéntale a alguien cercana: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Si prefieren venir juntas, respóndenos por aquí y reservamos para las dos.',
      ),
      message(
        '{{nombre}}, ¿vienes acompañada? 🌿',
        'En Leonice Arenas Spa Capilar tenemos *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Escríbenos por aquí y agendamos con gusto.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Compartir el cuidado es más lindo: *{{promocion}}* con *{{descuento}}% de descuento* {{vigencia}}.',
        'Respóndenos por aquí y te ayudamos a coordinar el horario.',
      ),
    ],
  ),
  broadcast(
    'CARE_REMINDER',
    'recordatorio_cuidado',
    'Recordatorio de mantenimiento para quienes llevan un tiempo sin su cuidado capilar.',
    ['nombre', 'dias'],
    [
      message(
        'Hola {{nombre}} 🌿',
        'Han pasado {{dias}} días desde tu última visita a Leonice Arenas Spa Capilar. Para mantener los resultados, conviene retomar el cuidado con regularidad.',
        '¿Agendamos tu próxima cita? Respóndenos por aquí y te mostramos los horarios disponibles.',
      ),
      message(
        '{{nombre}}, ¿cómo va tu cabello? 🌿',
        'Hace {{dias}} días fue tu última cita con nosotras y puede ser buen momento para un mantenimiento.',
        'Si quieres, escríbenos por aquí y reservamos tu horario.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Pasaron {{dias}} días desde tu última visita. Cuidar tu cabello con constancia hace la diferencia.',
        'Respóndenos por aquí y te ayudamos a agendar.',
      ),
    ],
  ),
  broadcast(
    'HOME_CARE',
    'cuidado_en_casa',
    'Invitación a conocer los productos para la rutina capilar en casa.',
    ['nombre'],
    [
      message(
        'Hola {{nombre}} 🌿',
        'Entre cita y cita, el cuidado en casa hace la diferencia. En Leonice Arenas Spa Capilar tenemos productos para tu rutina.',
        'Cuéntanos por aquí cómo es tu cabello y te recomendamos lo más adecuado.',
      ),
      message(
        '{{nombre}}, ¿cómo cuidas tu cabello en casa? 🌿',
        'Tenemos productos pensados para mantener los resultados de tus tratamientos.',
        'Escríbenos por aquí y te asesoramos sin compromiso.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Si quieres alargar los resultados de tu última visita, podemos recomendarte productos para usar en casa.',
        'Respóndenos por aquí y te contamos las opciones.',
      ),
    ],
  ),
  broadcast(
    'BOOK_AHEAD',
    'agenda_anticipada',
    'Aviso para agendar con tiempo antes de festivos y temporadas de alta demanda.',
    ['nombre'],
    [
      message(
        'Hola {{nombre}} 🌿',
        'En festivos y épocas de mucha demanda, como fin de año, la agenda de Leonice Arenas Spa Capilar se llena rápido.',
        'Si quieres asegurar tu horario, respóndenos por aquí y agendamos con tiempo.',
      ),
      message(
        '{{nombre}}, agenda con tiempo 🌿',
        'Se acercan fechas con muchas reservas y queremos que consigas el horario que prefieres.',
        'Escríbenos por aquí y te mostramos la disponibilidad.',
      ),
      message(
        'Hola {{nombre}} 🌿',
        'Para que no te quedes sin cupo en las próximas semanas, te invitamos a reservar con anticipación.',
        'Respóndenos por aquí y te ayudamos a escoger tu día.',
      ),
    ],
  ),
];
