export interface HairServiceStep {
  title: string;
  description: string;
}

export interface HairService {
  name: string;
  slug: string;
  displayOrder: number;
  requiresPriorAssessment: boolean;
  basePriceMin: number;
  basePriceMax: number;
  baseDurationMinMinutes: number;
  baseDurationMaxMinutes: number;
  tagline: string;
  summary: string;
  idealFor: string[];
  benefits: string[];
  results: string;
  aftercare: string[];
  considerations: string[];
  recommendedFrequency: string | null;
  steps: HairServiceStep[];
}

export const HAIR_SERVICES_CATEGORY_SLUG = 'spa-capilar';

export const HAIR_SERVICES: HairService[] = [
  {
    name: 'Corte de cabello',
    slug: 'corte-de-cabello',
    displayOrder: 12,
    requiresPriorAssessment: false,
    basePriceMin: 45,
    basePriceMax: 45,
    baseDurationMinMinutes: 45,
    baseDurationMaxMinutes: 45,
    tagline: 'Puntas sanas y una forma que te favorece.',
    summary:
      'Cortamos según tu tipo de cabello, tu rostro y cómo lo llevas a diario: desde despuntar y retirar puntas abiertas hasta un cambio de forma o de largo. Conversamos antes de cortar para que sepas exactamente cómo vas a quedar.',
    idealFor: [
      'Puntas abiertas o maltratadas',
      'Quien quiere mantener su largo con un despunte',
      'Un cambio de forma, capas o flequillo',
      'Retirar las puntas dañadas por procesos químicos',
    ],
    benefits: [
      'Puntas sanas que se ven y se sienten mejor',
      'Una forma pensada para tu rostro y tu rutina',
      'Cabello más fácil de peinar en casa',
    ],
    results:
      'Sales con las puntas limpias y la forma que acordamos. Un corte a tiempo evita que las puntas abiertas suban por la fibra y ayuda a que tus terapias rindan más.',
    aftercare: [
      'Usa protector térmico antes de secador o plancha para cuidar las puntas.',
      'Desenreda de puntas a raíz con un peine de dientes anchos.',
      'Agenda tu próximo despunte antes de que vuelvan a abrirse las puntas.',
    ],
    considerations: [
      'Si quieres un cambio grande de largo o de forma, cuéntanos y tráenos una foto de referencia.',
      'Puedes combinarlo con una terapia capilar el mismo día.',
    ],
    recommendedFrequency: 'Cada 2 a 3 meses para mantener las puntas sanas.',
    steps: [
      {
        title: 'Conversación y diagnóstico',
        description:
          'Revisamos tus puntas, la textura y el largo, y acordamos contigo el corte antes de empezar.',
      },
      {
        title: 'Lavado',
        description:
          'Lavamos tu cabello para cortar sobre la fibra limpia y ver su caída natural.',
      },
      {
        title: 'Corte',
        description:
          'Cortamos por secciones según la forma acordada, retirando las puntas maltratadas.',
      },
      {
        title: 'Secado y acabado',
        description:
          'Secamos y revisamos contigo el resultado para ajustar cualquier detalle.',
      },
    ],
  },
  {
    name: 'Cepillado',
    slug: 'cepillado',
    displayOrder: 13,
    requiresPriorAssessment: false,
    basePriceMin: 35,
    basePriceMax: 55,
    baseDurationMinMinutes: 45,
    baseDurationMaxMinutes: 60,
    tagline: 'Cabello liso o con movimiento, listo para lucir.',
    summary:
      'El cepillado es un secado con cepillo y calor que deja tu cabello liso, con volumen o con ondas suaves, según lo que quieras para ese día. No cambia la estructura de tu cabello: el resultado dura hasta tu próximo lavado.',
    idealFor: [
      'Un evento, una reunión o un día especial',
      'Quien quiere salir peinada después de su terapia',
      'Cabello con frizz que quiere un acabado pulido',
    ],
    benefits: [
      'Acabado liso, brillante y con movimiento',
      'Menos frizz durante varios días',
      'Sin químicos: solo lavado, producto y calor',
    ],
    results:
      'Sales peinada, con un cabello brillante y manejable. Dura más si evitas la humedad y no lo lavas en los días siguientes.',
    aftercare: [
      'Duerme con el cabello recogido suave o con una gorra de satín.',
      'Evita la humedad y el sudor intenso para que el cepillado dure más.',
      'Si te lo lavas, usa protector térmico antes de volver a secarlo.',
    ],
    considerations: [
      'El precio y el tiempo dependen del largo y la abundancia de tu cabello.',
      'No es un alisado: al lavarte, tu cabello vuelve a su forma natural.',
      'Puedes combinarlo con una terapia capilar o un corte el mismo día.',
    ],
    recommendedFrequency: null,
    steps: [
      {
        title: 'Lavado',
        description:
          'Lavamos con shampoo y acondicionador acordes a tu tipo de cabello.',
      },
      {
        title: 'Protección térmica',
        description:
          'Aplicamos protector térmico para cuidar la fibra del calor del secador.',
      },
      {
        title: 'Cepillado por secciones',
        description:
          'Secamos con cepillo mechón por mechón para darle la forma, el brillo y el volumen que quieres.',
      },
      {
        title: 'Acabado',
        description:
          'Sellamos las puntas y te damos tips para que el peinado dure más.',
      },
    ],
  },
  {
    name: 'Tinte',
    slug: 'tinte',
    displayOrder: 14,
    requiresPriorAssessment: false,
    basePriceMin: 120,
    basePriceMax: 220,
    baseDurationMinMinutes: 120,
    baseDurationMaxMinutes: 180,
    tagline: 'Color uniforme, canas cubiertas y brillo.',
    summary:
      'Aplicamos tinte profesional de raíz a puntas o solo en la raíz (retoque) para cubrir canas, unificar tu color o cambiar de tono dentro de lo que tu cabello permite. Revisamos tu historial de color antes de aplicar, porque los tintes anteriores definen qué resultado es posible.',
    idealFor: [
      'Cubrir canas',
      'Retocar la raíz que ya creció',
      'Unificar un color disparejo o desvanecido',
      'Cambiar a un tono similar o más oscuro',
    ],
    benefits: [
      'Color uniforme de raíz a puntas',
      'Canas cubiertas',
      'Brillo y un aspecto más cuidado',
    ],
    results:
      'Sales con un color parejo y brillante. Cuánto dura depende de tu tipo de cabello, del crecimiento de la raíz y de los cuidados en casa.',
    aftercare: [
      'Espera al menos 48 horas antes del primer lavado para fijar el color.',
      'Usa shampoo sin sulfatos y productos para cabello teñido.',
      'Protege tu cabello del sol y del cloro de las piscinas.',
      'Complementa con una terapia de hidratación o un baño de color para mantener el brillo.',
    ],
    considerations: [
      'El precio y el tiempo dependen del largo, la abundancia y si es retoque de raíz o color completo.',
      'Aclarar varios tonos, hacer rayitos o pasar de un tinte oscuro a uno claro requiere valoración: puede necesitar decoloración o varias sesiones.',
      'Si es tu primera vez con tinte o alguna vez te dio reacción, cuéntanos antes de la cita.',
      'Puedes combinarlo con un corte o un cepillado el mismo día.',
    ],
    recommendedFrequency:
      'Retoque de raíz cada 4 a 6 semanas, según qué tan rápido crece tu cabello.',
    steps: [
      {
        title: 'Diagnóstico de color',
        description:
          'Revisamos tu color actual, tus canas y los tintes anteriores para elegir el tono y la fórmula.',
      },
      {
        title: 'Protección del cuero cabelludo',
        description:
          'Protegemos la piel del contorno del rostro y preparamos el cabello por secciones.',
      },
      {
        title: 'Aplicación del tinte',
        description:
          'Aplicamos de raíz a puntas o solo en la raíz, según lo que necesites.',
      },
      {
        title: 'Tiempo de acción',
        description:
          'Dejamos actuar el color el tiempo que indica la fórmula para tu cabello.',
      },
      {
        title: 'Enjuague y sellado',
        description:
          'Retiramos el tinte con productos que sellan la cutícula y fijan el color.',
      },
      {
        title: 'Secado y acabado',
        description:
          'Secamos y te explicamos cómo cuidar el color en casa para que dure más.',
      },
    ],
  },
];
